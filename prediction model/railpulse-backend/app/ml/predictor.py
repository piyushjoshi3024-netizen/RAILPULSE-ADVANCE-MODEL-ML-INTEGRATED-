import math

import pandas as pd

from app.ml.features import FEATURE_COLUMNS
from app.ml.model_registry import ModelRegistry, model_registry


class ETAPredictor:
    """Runs the ETA and delay pipelines against a validated feature mapping."""

    def __init__(self, registry: ModelRegistry | None = None) -> None:
        self._registry = registry

    @property
    def registry(self) -> ModelRegistry:
        """Return the bound registry, defaulting to the shared instance."""
        return self._registry if self._registry is not None else model_registry

    def predict(self, features: dict) -> tuple[float, float]:
        """Return non-negative (remaining_minutes, delay_minutes) predictions."""
        registry = self.registry
        eta_pipeline = registry.eta_pipeline
        delay_pipeline = registry.delay_pipeline

        if eta_pipeline is None or delay_pipeline is None:
            raise ValueError("Model pipelines are not loaded.")

        missing = [column for column in FEATURE_COLUMNS if column not in features]
        extra = [column for column in features if column not in FEATURE_COLUMNS]
        if missing or extra:
            raise ValueError(f"Inference feature mismatch: missing={missing}, extra={extra}")

        df = pd.DataFrame([[features[column] for column in FEATURE_COLUMNS]], columns=FEATURE_COLUMNS)

        remaining_minutes = eta_pipeline.predict(df)[0]
        delay_minutes = delay_pipeline.predict(df)[0]
        if not all(math.isfinite(float(value)) for value in (remaining_minutes, delay_minutes)):
            raise ValueError("Model returned a non-finite prediction.")
        remaining_minutes = max(0.0, float(remaining_minutes))
        delay_minutes = max(0.0, float(delay_minutes))

        return remaining_minutes, delay_minutes


class DelayClassifier:
    """Maps a predicted delay in minutes onto a delay category band."""

    def classify(self, delay_minutes: float) -> str:
        """Return the delay category for the predicted delay."""
        if delay_minutes <= 5:
            return "ON_TIME"
        elif delay_minutes <= 15:
            return "MINOR"
        elif delay_minutes <= 60:
            return "MODERATE"
        elif delay_minutes <= 120:
            return "MAJOR"
        else:
            return "SEVERE"


class RiskClassifier:
    """Maps a predicted delay in minutes onto an operational risk level."""

    def classify(self, delay_minutes: float) -> str:
        """Return the risk level for the predicted delay."""
        if delay_minutes <= 15:
            return "LOW"
        elif delay_minutes <= 60:
            return "MODERATE"
        return "HIGH"


eta_predictor = ETAPredictor()
delay_classifier = DelayClassifier()
risk_classifier = RiskClassifier()


def predict_eta_and_delay(features: dict):
    return eta_predictor.predict(features)


def classify_delay(delay_minutes: float) -> str:
    return delay_classifier.classify(delay_minutes)


def classify_risk(delay_minutes: float) -> str:
    return risk_classifier.classify(delay_minutes)
