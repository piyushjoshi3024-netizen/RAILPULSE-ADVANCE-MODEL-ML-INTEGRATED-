from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.ml.features import CATEGORICAL_FEATURES, FEATURE_COLUMNS, NUMERIC_FEATURES
from training.data_loader import TrainingDataLoader
from training.evaluation import CALIBRATION_LEVEL, MetricsCalculator, UncertaintyCalibrator
from training.pipeline import RANDOM_STATE, PipelineFactory
from training.splitter import ChronologicalTripGroupSplitter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "indian_railway_delay_data_.csv")
MODEL_PATH = os.path.join(BASE_DIR, "models", "railpulse_eta_model.pkl")
MODEL_VERSION = "eta-v2"


class ETAModelTrainer:
    """Trains, evaluates, calibrates and persists the ETA/delay model bundle."""

    def __init__(
        self,
        data_path: str = DATA_PATH,
        model_path: str = MODEL_PATH,
        splitter: ChronologicalTripGroupSplitter | None = None,
        pipeline_factory: PipelineFactory | None = None,
        metrics: MetricsCalculator | None = None,
        calibrator: UncertaintyCalibrator | None = None,
    ) -> None:
        self.data_path = data_path
        self.model_path = model_path
        self.loader = TrainingDataLoader(data_path)
        self.splitter = splitter or ChronologicalTripGroupSplitter()
        self.pipelines = pipeline_factory or PipelineFactory(random_state=RANDOM_STATE)
        self.metrics = metrics or MetricsCalculator()
        self.calibrator = calibrator or UncertaintyCalibrator(level=CALIBRATION_LEVEL)

    def run(self) -> tuple[dict[str, Any], dict[str, Any]]:
        """Train on the chronological split, save the bundle and return metrics."""
        data = self.loader.load()
        train, validation, test = self.splitter.split(data)

        train_features = train.loc[:, FEATURE_COLUMNS]
        validation_features = validation.loc[:, FEATURE_COLUMNS]
        test_features = test.loc[:, FEATURE_COLUMNS]

        eta_validation_pipeline = self.pipelines.build()
        delay_validation_pipeline = self.pipelines.build()
        eta_validation_pipeline.fit(train_features, train["target_eta_minutes"])
        delay_validation_pipeline.fit(train_features, train["target_delay_minutes"])

        eta_validation_predictions = eta_validation_pipeline.predict(validation_features)
        delay_validation_predictions = delay_validation_pipeline.predict(validation_features)
        eta_uncertainty, eta_coverage = self.calibrator.calibrate(
            validation["target_eta_minutes"], eta_validation_predictions
        )
        delay_uncertainty, delay_coverage = self.calibrator.calibrate(
            validation["target_delay_minutes"], delay_validation_predictions
        )

        final_train = pd.concat([train, validation], ignore_index=True)
        eta_pipeline = self.pipelines.build().fit(
            final_train.loc[:, FEATURE_COLUMNS], final_train["target_eta_minutes"]
        )
        delay_pipeline = self.pipelines.build().fit(
            final_train.loc[:, FEATURE_COLUMNS], final_train["target_delay_minutes"]
        )
        eta_predictions = eta_pipeline.predict(test_features)
        delay_predictions = delay_pipeline.predict(test_features)

        baseline_delay = float(final_train["target_delay_minutes"].mean())
        baseline_eta_predictions = test["scheduled_travel_time_minutes"].to_numpy() + baseline_delay
        baseline_delay_predictions = np.full(len(test), baseline_delay)

        regression_metrics = self.metrics.regression_metrics
        metrics = {
            "validation": {
                "eta_ml": regression_metrics(validation["target_eta_minutes"], eta_validation_predictions),
                "delay_ml": regression_metrics(validation["target_delay_minutes"], delay_validation_predictions),
            },
            "test": {
                "eta_baseline": regression_metrics(test["target_eta_minutes"], baseline_eta_predictions),
                "eta_ml": regression_metrics(test["target_eta_minutes"], eta_predictions),
                "delay_baseline": regression_metrics(test["target_delay_minutes"], baseline_delay_predictions),
                "delay_ml": regression_metrics(test["target_delay_minutes"], delay_predictions),
            },
        }

        split_metadata = self._split_metadata(train, validation, test)
        metadata = {
            "version": MODEL_VERSION,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "features": FEATURE_COLUMNS,
            "numeric_features": NUMERIC_FEATURES,
            "categorical_features": CATEGORICAL_FEATURES,
            "targets": ["target_eta_minutes", "target_delay_minutes"],
            "split": split_metadata,
            "baseline": {"delay_mean_minutes": baseline_delay},
            "uncertainty": {
                "method": "validation_absolute_error_quantile",
                "calibration_level": self.calibrator.level,
                "eta_interval_minutes": eta_uncertainty,
                "eta_calibration_coverage": eta_coverage,
                "delay_interval_minutes": delay_uncertainty,
                "delay_calibration_coverage": delay_coverage,
            },
            "metrics": metrics,
        }

        bundle = {
            "eta_pipeline": eta_pipeline,
            "delay_pipeline": delay_pipeline,
            "metadata": metadata,
        }
        self.save(bundle)
        return bundle, metrics

    @staticmethod
    def _split_metadata(
        train: pd.DataFrame, validation: pd.DataFrame, test: pd.DataFrame
    ) -> dict[str, Any]:
        """Return the split description stored alongside the model."""
        return {
            "strategy": "chronological_trip_group_split",
            "group_column": "trip_group",
            "train_rows": len(train),
            "validation_rows": len(validation),
            "test_rows": len(test),
            "train_date_max": train["event_date"].max().date().isoformat(),
            "validation_date_range": [
                validation["event_date"].min().date().isoformat(),
                validation["event_date"].max().date().isoformat(),
            ],
            "test_date_min": test["event_date"].min().date().isoformat(),
        }

    def save(self, bundle: dict[str, Any]) -> None:
        """Persist the bundle to the configured artifact path."""
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(bundle, self.model_path)
