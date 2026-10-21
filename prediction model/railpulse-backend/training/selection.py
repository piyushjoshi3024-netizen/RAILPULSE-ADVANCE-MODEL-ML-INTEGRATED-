"""Chronological model selection: CV on the development window only."""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import GridSearchCV

from training.feature_contract import JourneyFeatureBuilder
from training.config import RANDOM_SEED
from training.evaluation import RegressionEvaluator
from training.models import ModelZoo
from training.splitter import ChronologicalDateSplitter

logger = logging.getLogger(__name__)


@dataclass
class SelectionResult:
    """One candidate's cross-validated score and refit estimator."""

    name: str
    encoder: str
    cv_mae_mean: float
    cv_mae_std: float
    best_params: dict[str, Any]
    estimator: Any

    def as_row(self) -> dict[str, Any]:
        return {
            "model": self.name,
            "encoder": self.encoder,
            "cv_mae_minutes": round(self.cv_mae_mean, 3),
            "cv_mae_std": round(self.cv_mae_std, 3),
            "best_params": self.best_params,
        }


class ModelSelector:
    """Selects a delay regressor by expanding-window cross-validation.

    The test partition is never seen here: candidates are scored on folds cut
    out of the development window, and only the winner is later refit and
    scored once on the held-out test set.
    """

    def __init__(
        self,
        seed: int = RANDOM_SEED,
        n_splits: int = 4,
        encoders: tuple[str, ...] = ("onehot", "target"),
        quick: bool = False,
    ) -> None:
        self.seed = seed
        self.n_splits = n_splits
        self.encoders = encoders
        self.quick = quick
        self.zoo = ModelZoo(seed)
        self.builder = JourneyFeatureBuilder()
        self.splitter = ChronologicalDateSplitter()

    def baseline_scores(self, development: pd.DataFrame) -> list[SelectionResult]:
        """Cross-validate the reference baselines on the same folds."""
        X, y = self._xy(development)
        folds = self.splitter.expanding_folds(development, self.n_splits)
        results = []
        for name, estimator in self.zoo.baselines().items():
            scores = []
            for train_idx, valid_idx in folds:
                model = self._clone(estimator)
                model.fit(X.iloc[train_idx], y[train_idx])
                prediction = model.predict(X.iloc[valid_idx])
                scores.append(RegressionEvaluator.metrics(y[valid_idx], prediction)["mae_minutes"])
            fitted = self._clone(estimator).fit(X, y)
            results.append(SelectionResult(name, "none", float(np.mean(scores)), float(np.std(scores)), {}, fitted))
            logger.info("baseline=%s cv_mae=%.3f", name, float(np.mean(scores)))
        return results

    def candidate_scores(self, development: pd.DataFrame) -> list[SelectionResult]:
        """Grid-search every candidate across the configured encoders."""
        X, y = self._xy(development)
        folds = self.splitter.expanding_folds(development, self.n_splits)
        results: list[SelectionResult] = []
        candidates = self.zoo.candidates()
        if self.quick:
            candidates = {k: candidates[k] for k in ("ridge", "hist_gradient_boosting") if k in candidates}

        for name, spec in candidates.items():
            for encoder in self.encoders:
                pipeline = self.zoo.build_pipeline(self._clone(spec["estimator"]), encoder)
                grid = spec["grid"] if not self.quick else {k: v[:1] for k, v in spec["grid"].items()}
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    search = GridSearchCV(
                        pipeline, grid, scoring="neg_mean_absolute_error",
                        cv=folds, n_jobs=1, refit=True, error_score="raise",
                    )
                    search.fit(X, y)
                index = int(search.best_index_)
                results.append(SelectionResult(
                    name, encoder,
                    float(-search.cv_results_["mean_test_score"][index]),
                    float(search.cv_results_["std_test_score"][index]),
                    {k.replace("model__", ""): v for k, v in search.best_params_.items()},
                    search.best_estimator_,
                ))
                logger.info("candidate=%s encoder=%s cv_mae=%.3f", name, encoder, results[-1].cv_mae_mean)
        return results

    def comparison_table(self, development: pd.DataFrame) -> tuple[pd.DataFrame, list[SelectionResult]]:
        """Return the ranked comparison table and every scored result."""
        results = self.baseline_scores(development) + self.candidate_scores(development)
        table = pd.DataFrame([r.as_row() for r in results]).sort_values("cv_mae_minutes").reset_index(drop=True)
        return table, results

    @staticmethod
    def best(results: list[SelectionResult]) -> SelectionResult:
        """Return the lowest cross-validated MAE result."""
        return min(results, key=lambda r: r.cv_mae_mean)

    def _xy(self, frame: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
        return self.builder.frame_from_training(frame), frame["delay_minutes"].to_numpy(dtype=float)

    @staticmethod
    def _clone(estimator):
        from sklearn.base import clone

        return clone(estimator)
