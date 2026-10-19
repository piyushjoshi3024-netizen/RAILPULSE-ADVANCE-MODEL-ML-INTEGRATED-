"""Trains, evaluates and registers the delay prediction bundle.

Per the Gate 2 decision the shipped point estimate is the P50 quantile model.
The global-mean baseline is fitted and registered alongside it as a reference,
and every metric is recorded as measured - including the fact that the model
does not beat that baseline on this dataset.
"""

from __future__ import annotations

import logging
import warnings
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import clone

from training.feature_contract import (
    UNSUPPORTED_REQUEST_FIELDS,
    JourneyFeatureBuilder,
    RouteReference,
)
from training.config import (
    DELAY_BANDS, MODEL_VERSION, QUANTILES, RANDOM_SEED, SIGNIFICANT_DELAY_MINUTES,
)
from training.dataset_config import DatasetConfig
from training.download_data import DatasetFetcher
from training.evaluation import (
    ClassificationEvaluator, ConformalCalibrator, RegressionEvaluator, SegmentEvaluator,
)
from training.models import ModelZoo
from training.probabilistic import (
    BAND_LABELS, CalibratedDelayClassifier, QuantileRegressorSet, RiskPolicy, merge_bands,
)
from training.registry import ModelRegistryWriter, git_commit
from training.selection import ModelSelector
from training.splitter import ChronologicalDateSplitter

logger = logging.getLogger(__name__)


class DelayModelTrainer:
    """End-to-end training for the delay bundle."""

    def __init__(
        self,
        config: DatasetConfig | None = None,
        seed: int = RANDOM_SEED,
        quick: bool = False,
    ) -> None:
        self.config = config or DatasetConfig()
        self.seed = seed
        self.quick = quick
        self.builder = JourneyFeatureBuilder.from_config(self.config)
        self.splitter = ChronologicalDateSplitter()
        self.zoo = ModelZoo(seed, self.config.numeric_features, self.config.categorical_features)
        self.risk_policy = RiskPolicy()

    def run(self, data: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any]]:
        """Train on the clean frame and return (bundle, metadata)."""
        warnings.simplefilter("ignore")
        train, validation, test = self.splitter.split(data)
        development = pd.concat([train, validation], ignore_index=True)
        logger.info("split rows train=%d validation=%d test=%d", len(train), len(validation), len(test))

        selection = self._select(development)
        Xdev, ydev = self._xy(development)
        Xte, yte = self._xy(test)

        quantiles = QuantileRegressorSet(QUANTILES, selection["encoder"], self.seed).fit(Xdev, ydev)
        quantile_test = quantiles.predict(Xte)
        point_test = quantile_test[0.5]

        point_model = clone(selection["estimator"]).fit(Xdev, ydev)
        baseline_model = clone(self.zoo.baselines()["baseline_global_mean"]).fit(Xdev, ydev)

        binary = CalibratedDelayClassifier("binary", selection["encoder"], self.seed).fit(
            Xdev, development["is_significant_delay"].to_numpy()
        )
        probability_test = self._positive_probability(binary, Xte)

        conformal = self._fit_conformal(train, validation, selection)
        metrics = self._evaluate(
            test, yte, point_test, quantile_test, probability_test,
            point_model.predict(Xte), baseline_model.predict(Xte),
        )

        bundle = {
            "quantile_models": quantiles,
            "point_model": point_model,
            "baseline_model": baseline_model,
            "binary_classifier": binary,
            "conformal": conformal,
            "route_reference": RouteReference.from_frame(data),
            "feature_columns": self.builder.feature_columns,
            "risk_policy": self.risk_policy,
        }
        metadata = self._metadata(data, train, validation, test, selection, metrics)
        bundle["metadata"] = metadata
        return bundle, metadata

    def register(self, bundle: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
        """Write the bundle to the registry and repoint `latest`."""
        return ModelRegistryWriter().register(bundle, metadata)

    def _select(self, development: pd.DataFrame) -> dict[str, Any]:
        selector = ModelSelector(self.seed, quick=self.quick)
        selector.builder = self.builder
        selector.zoo = self.zoo
        table, results = selector.comparison_table(development)
        candidates = [r for r in results if not r.name.startswith("baseline")]
        best = min(candidates, key=lambda r: r.cv_mae_mean)
        logger.info("selected model=%s encoder=%s cv_mae=%.3f", best.name, best.encoder, best.cv_mae_mean)
        return {
            "name": best.name, "encoder": best.encoder, "estimator": best.estimator,
            "params": best.best_params, "cv_mae": best.cv_mae_mean, "cv_std": best.cv_mae_std,
            "cv_table": table.to_dict(orient="records"),
        }

    def _fit_conformal(self, train, validation, selection) -> ConformalCalibrator:
        """Calibrate interval width on the validation window, never on test."""
        Xtr, ytr = self._xy(train)
        Xva, yva = self._xy(validation)
        model = clone(selection["estimator"]).fit(Xtr, ytr)
        return ConformalCalibrator(coverage=0.8).fit(yva, model.predict(Xva))

    def _evaluate(self, test, yte, point_test, quantile_test, probability_test,
                  selected_point, baseline_point) -> dict[str, Any]:
        regression = RegressionEvaluator
        band_from_p50 = pd.Series(point_test).map(self._band)
        metrics = {
            "test_point_p50": regression.metrics(yte, point_test),
            "test_point_selected_regressor": regression.metrics(yte, selected_point),
            "test_baseline_global_mean": regression.metrics(yte, baseline_point),
            "test_intervals": {
                "nominal_coverage": 0.8,
                **regression.interval_coverage(yte, quantile_test[0.1], quantile_test[0.9]),
                "pinball": {f"q{q}": regression.pinball_loss(yte, quantile_test[q], q) for q in QUANTILES},
            },
            "test_binary_classifier": ClassificationEvaluator.binary_metrics(
                test["is_significant_delay"].to_numpy(), probability_test
            ),
            "test_binary_calibration": ClassificationEvaluator.calibration_curve(
                test["is_significant_delay"].to_numpy(), probability_test, bins=4
            ),
            "test_band_from_p50_accuracy": float(
                (band_from_p50.to_numpy() == test["delay_band"].to_numpy()).mean()
            ),
        }
        segment = test.copy()
        segment["prediction"] = point_test
        metrics["test_error_by_segment"] = {
            column: SegmentEvaluator.by_segment(segment, "delay_minutes", "prediction", column)
            .reset_index().to_dict(orient="records")
            for column in ("train_number", "run_frequency")
            if column in segment.columns
        }
        metrics["beats_baseline"] = bool(
            metrics["test_point_p50"]["mae_minutes"] < metrics["test_baseline_global_mean"]["mae_minutes"]
        )
        return metrics

    def _metadata(self, data, train, validation, test, selection, metrics) -> dict[str, Any]:
        provenance = DatasetFetcher(self.config).describe()
        return {
            "version": ModelRegistryWriter().version_name(MODEL_VERSION),
            "model_version": MODEL_VERSION,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "git_commit": git_commit(),
            "seed": self.seed,
            "data_provenance": self.config.data_provenance,
            "dataset": {
                **provenance,
                "provenance": self.config.data_provenance,
                "rows": int(len(data)),
                "date_range": [str(data["journey_date"].min().date()), str(data["journey_date"].max().date())],
                "distinct_trains": int(data["train_number"].nunique()),
            },
            "split": {
                "strategy": "chronological_by_journey_date",
                "train_rows": len(train), "validation_rows": len(validation), "test_rows": len(test),
                "train_end": str(train["journey_date"].max().date()),
                "test_start": str(test["journey_date"].min().date()),
            },
            "features": self.builder.feature_columns,
            "numeric_features": self.config.numeric_features,
            "categorical_features": self.config.categorical_features,
            "excluded_features": self.config.excluded_features,
            "unsupported_request_fields": list(UNSUPPORTED_REQUEST_FIELDS),
            "selection": {
                "point_model_for_serving": "quantile_p50",
                "selected_regressor": selection["name"],
                "encoder": selection["encoder"],
                "params": selection["params"],
                "cv_mae_minutes": selection["cv_mae"],
                "cv_mae_std": selection["cv_std"],
                "cv_table": selection["cv_table"],
            },
            "quantiles": list(QUANTILES),
            "delay_bands": [[low, high if high != float("inf") else None, name] for low, high, name in DELAY_BANDS],
            "significant_delay_minutes": SIGNIFICANT_DELAY_MINUTES,
            "band_labels": BAND_LABELS,
            "risk_policy": self.risk_policy.describe(),
            "metrics": metrics,
            "beats_baseline": metrics["beats_baseline"],
        }

    @staticmethod
    def _band(delay_minutes: float) -> str:
        from training.config import delay_band

        return delay_band(float(delay_minutes))

    @staticmethod
    def _positive_probability(classifier: CalibratedDelayClassifier, X: pd.DataFrame) -> np.ndarray:
        index = list(classifier.classes_).index("1") if "1" in classifier.classes_ else 1
        return classifier.predict_proba(X)[:, index]

    def _xy(self, frame: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
        return self.builder.frame_from_training(frame), frame["delay_minutes"].to_numpy(dtype=float)
