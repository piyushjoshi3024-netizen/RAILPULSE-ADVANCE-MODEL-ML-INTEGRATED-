"""Trains, evaluates and registers the delay prediction bundle.

Per the Gate 2 decision the shipped point estimate is the P50 quantile model.
The global-mean baseline is fitted and registered alongside it as a reference,
and every metric is recorded as measured - including the fact that the model
does not beat that baseline on this dataset.
"""

from __future__ import annotations

import json
import logging
import os
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
    DELAY_BANDS, MODEL_VERSION, QUANTILES, RANDOM_SEED, REPORTS_DIR, SIGNIFICANT_DELAY_MINUTES,
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
        self._write_evaluation_export(
            metadata, selection, test, yte, quantile_test, probability_test,
        )
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

    def _write_evaluation_export(
        self, metadata, selection, test, yte, quantile_test, probability_test,
    ) -> str | None:
        """Write ``reports/evaluation.json`` beside the metrics already computed.

        Purely additive: every value written here was produced by the evaluation
        that just ran. Nothing is fitted, scored or re-ordered, so the metrics in
        the registered metadata are byte-identical with and without this call.

        The file exists so an operator can see the held-out predictions behind
        the aggregates -- residuals, per-row intervals, the candidate table --
        rather than being asked to trust a single MAE. It is regenerated by every
        training run and is not tracked in git.

        A write failure is logged and swallowed: an export is a reporting
        convenience and must never cost a completed training run.
        """
        try:
            dataset = metadata.get("dataset", {})
            split = metadata.get("split", {})
            actual = [float(value) for value in np.asarray(yte).ravel()]
            p10 = [float(value) for value in np.asarray(quantile_test[0.1]).ravel()]
            p50 = [float(value) for value in np.asarray(quantile_test[0.5]).ravel()]
            p90 = [float(value) for value in np.asarray(quantile_test[0.9]).ravel()]
            probability = [float(value) for value in np.asarray(probability_test).ravel()]

            def column(name: str) -> list:
                if name not in test.columns:
                    return [None] * len(actual)
                return [None if pd.isna(value) else value for value in test[name].tolist()]

            journey_date = [
                None if value is None else str(pd.Timestamp(value).date())
                for value in column("journey_date")
            ]
            train_number = [None if value is None else str(value) for value in column("train_number")]
            season = [None if value is None else str(value) for value in column("season")]
            run_frequency = [None if value is None else str(value) for value in column("run_frequency")]

            rows = [
                {
                    "journey_date": journey_date[i],
                    "train_number": train_number[i],
                    "season": season[i],
                    "run_frequency": run_frequency[i],
                    "actual_delay_minutes": actual[i],
                    "p10": p10[i],
                    "p50": p50[i],
                    "p90": p90[i],
                    "p_delay_gt_15": probability[i],
                    # Written out so a reader never has to recompute the sign
                    # convention: positive means the model predicted too high.
                    "residual_minutes": p50[i] - actual[i],
                }
                for i in range(len(actual))
            ]

            payload = {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "schema_version": 1,
                "model": {
                    "version": metadata.get("version"),
                    "model_version": metadata.get("model_version"),
                    "trained_at": metadata.get("trained_at"),
                    "git_commit": metadata.get("git_commit"),
                    "seed": metadata.get("seed"),
                    "selected_regressor": selection.get("name"),
                    "encoder": selection.get("encoder"),
                },
                "dataset": {
                    "name": dataset.get("name"),
                    "rows": dataset.get("rows"),
                    "distinct_trains": dataset.get("distinct_trains"),
                    "date_range": dataset.get("date_range"),
                    "sha256": dataset.get("sha256"),
                    "provenance": dataset.get("provenance"),
                    "path": dataset.get("path"),
                },
                "split": {
                    "strategy": split.get("strategy"),
                    "train_rows": split.get("train_rows"),
                    "validation_rows": split.get("validation_rows"),
                    "test_rows": split.get("test_rows"),
                    "train_end": split.get("train_end"),
                    "test_start": split.get("test_start"),
                },
                "aggregates": metadata.get("metrics", {}),
                "candidates": selection.get("cv_table", []),
                "test_rows": rows,
            }

            os.makedirs(REPORTS_DIR, exist_ok=True)
            path = os.path.join(REPORTS_DIR, "evaluation.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, sort_keys=True, default=str)
            logger.info("wrote evaluation export rows=%d path=%s", len(rows), path)
            return path
        except Exception as exc:  # pragma: no cover - reporting must not break training
            logger.warning("Evaluation export skipped: %s", exc)
            return None

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
