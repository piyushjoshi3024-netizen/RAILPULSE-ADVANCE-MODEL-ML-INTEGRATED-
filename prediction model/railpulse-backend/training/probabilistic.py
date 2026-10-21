"""Quantile regressors and calibrated classifiers for probabilistic output.

The point regressor answers 'how late'; these models answer 'how uncertain'
and 'how likely is a material delay', both from fitted models rather than
from fixed thresholds applied to a point estimate.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

from training.config import QUANTILES, RANDOM_SEED, SIGNIFICANT_DELAY_MINUTES
from training.models import ModelZoo

logger = logging.getLogger(__name__)

# MAJOR and SEVERE are merged for classification: the raw data holds only 3
# SEVERE journeys, too few to fit or evaluate a separate class honestly.
BAND_MERGE = {"ON_TIME": "ON_TIME", "MINOR": "MINOR", "MODERATE": "MODERATE",
              "MAJOR": "MAJOR_PLUS", "SEVERE": "MAJOR_PLUS"}
BAND_LABELS = ["ON_TIME", "MINOR", "MODERATE", "MAJOR_PLUS"]


def merge_bands(bands: pd.Series) -> pd.Series:
    """Collapse the five business bands into the four modelled classes."""
    return bands.map(BAND_MERGE).astype(str)


class QuantileRegressorSet:
    """Fits one gradient-boosted quantile regressor per quantile level."""

    def __init__(self, quantiles: tuple[float, ...] = QUANTILES, encoder: str = "target",
                 seed: int = RANDOM_SEED) -> None:
        self.quantiles = quantiles
        self.encoder = encoder
        self.seed = seed
        self.models_: dict[float, Any] = {}

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> "QuantileRegressorSet":
        """Fit one model per configured quantile."""
        from lightgbm import LGBMRegressor

        zoo = ModelZoo(self.seed)
        for quantile in self.quantiles:
            estimator = LGBMRegressor(
                objective="quantile", alpha=quantile, n_estimators=150, num_leaves=7,
                learning_rate=0.05, min_child_samples=10, random_state=self.seed,
                n_jobs=1, verbose=-1,
            )
            pipeline = zoo.build_pipeline(estimator, self.encoder)
            pipeline.fit(X, y)
            self.models_[quantile] = pipeline
        return self

    def predict(self, X: pd.DataFrame) -> dict[float, np.ndarray]:
        """Return predictions per quantile, floored at zero and made monotone."""
        raw = {q: np.maximum(0.0, self.models_[q].predict(X)) for q in self.quantiles}
        ordered = sorted(self.quantiles)
        stacked = np.vstack([raw[q] for q in ordered])
        # Enforce non-crossing quantiles; independent fits can invert on small data.
        stacked = np.maximum.accumulate(stacked, axis=0)
        return {q: stacked[i] for i, q in enumerate(ordered)}


class CalibratedDelayClassifier:
    """Calibrated probability model for a delay outcome.

    Wraps the base estimator in ``CalibratedClassifierCV`` so ``predict_proba``
    is a usable probability rather than an uncalibrated score.
    """

    def __init__(self, kind: str = "binary", encoder: str = "target", seed: int = RANDOM_SEED,
                 base: str = "hist") -> None:
        self.kind = kind
        self.encoder = encoder
        self.seed = seed
        self.base = base
        self.pipeline_: Any = None
        self.classes_: list[str] = []

    def _base_estimator(self):
        if self.base == "logistic":
            return LogisticRegression(max_iter=2000, random_state=self.seed)
        return HistGradientBoostingClassifier(
            random_state=self.seed, max_depth=2, learning_rate=0.05,
            max_iter=150, min_samples_leaf=10,
        )

    def fit(self, X: pd.DataFrame, y, cv: int = 3) -> "CalibratedDelayClassifier":
        """Fit the calibrated classifier, degrading to an uncalibrated fit if needed."""
        zoo = ModelZoo(self.seed)
        counts = pd.Series(y).value_counts()
        folds = int(min(cv, counts.min())) if len(counts) else cv
        estimator = self._base_estimator()
        if folds >= 2:
            estimator = CalibratedClassifierCV(estimator, cv=folds, method="sigmoid")
        else:
            logger.warning("calibration skipped: smallest class has %d samples", int(counts.min()))
        self.pipeline_ = zoo.build_pipeline(estimator, self.encoder, target_type="auto")
        self.pipeline_.fit(X, y)
        self.classes_ = [str(c) for c in self.pipeline_.named_steps["model"].classes_]
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline_.predict_proba(X)

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline_.predict(X)

    def probability_map(self, X: pd.DataFrame) -> list[dict[str, float]]:
        """Return per-row {class: probability} mappings."""
        probabilities = self.predict_proba(X)
        return [
            {label: float(row[index]) for index, label in enumerate(self.classes_)}
            for row in probabilities
        ]


class RiskPolicy:
    """Derives the risk level from calibrated probabilities.

    The thresholds here act on *model probabilities*, not on a point delay
    estimate, so the risk level moves with the model's own confidence.
    """

    def __init__(self, moderate_at: float = 0.5, high_at: float = 0.5) -> None:
        self.moderate_at = moderate_at
        self.high_at = high_at

    def level(self, p_significant_delay: float, p_major_plus: float) -> str:
        """Return LOW / MODERATE / HIGH for one journey."""
        if p_major_plus >= self.high_at:
            return "HIGH"
        if p_significant_delay >= self.moderate_at:
            return "MODERATE"
        return "LOW"

    def describe(self) -> dict[str, Any]:
        """Return the policy for the model card and API metadata."""
        return {
            "inputs": ["p_delay_gt_15", "p_band_MAJOR_PLUS"],
            "rule": (
                f"HIGH when P(MAJOR_PLUS) >= {self.high_at}; "
                f"MODERATE when P(delay > {SIGNIFICANT_DELAY_MINUTES:.0f} min) >= {self.moderate_at}; "
                "otherwise LOW"
            ),
        }
