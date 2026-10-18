"""Turns a train-state request into a probabilistic delay prediction."""

from __future__ import annotations

import logging
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np

from app.ml.feature_builder import (
    UNSUPPORTED_REQUEST_FIELDS,
    JourneyFeatureBuilder,
    RouteReference,
)
from app.ml.model_registry import ModelRegistry, model_registry
from training.config import SIGNIFICANT_DELAY_MINUTES, delay_band

logger = logging.getLogger(__name__)


class ModelNotReadyError(RuntimeError):
    """Raised when a prediction is requested before a model is registered."""


@dataclass
class DelayPrediction:
    """Everything the API returns about one journey."""

    train_number: str
    predicted_delay_minutes: float
    delay_p10_minutes: float
    delay_p50_minutes: float
    delay_p90_minutes: float
    predicted_eta: datetime
    eta_lower: datetime
    eta_upper: datetime
    predicted_remaining_minutes: float
    delay_category: str
    risk_level: str
    p_delay_gt_15: float
    confidence: float
    model_version: str
    data_source: str
    train_known_to_model: bool
    unsupported_fields_ignored: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DelayPredictor:
    """Predicts delay quantiles and the probability of a material delay.

    The point estimate is the P50 quantile model (Gate 2 decision 1A); the
    interval comes from the P10/P90 models, and the risk level is derived from
    calibrated classifier probabilities rather than from a threshold on P50.
    """

    def __init__(self, registry: ModelRegistry | None = None) -> None:
        self._registry = registry

    @property
    def registry(self) -> ModelRegistry:
        return self._registry if self._registry is not None else model_registry

    def predict(self, request) -> DelayPrediction:
        """Return the full prediction for a train-state request."""
        registry = self.registry
        if not registry.is_ready():
            raise ModelNotReadyError(registry.load_error() or "model is not available")

        builder = JourneyFeatureBuilder.from_feature_list(registry.feature_columns())
        reference: RouteReference = registry.route_reference
        features = builder.from_request(request, reference)
        frame = builder.frame_from_mapping(features)

        quantiles = registry.quantile_models.predict(frame)
        p10, p50, p90 = (float(quantiles[q][0]) for q in (0.1, 0.5, 0.9))
        if not all(math.isfinite(value) for value in (p10, p50, p90)):
            raise ValueError("Model returned a non-finite prediction.")
        p10, p50, p90 = max(0.0, p10), max(0.0, p50), max(0.0, p90)

        probability = self._significant_delay_probability(registry, frame)
        band_probability = self._major_probability(p50, p90)
        risk_level = registry.risk_policy.level(probability, band_probability)

        anchor = self._anchor(request)
        predicted_eta = anchor + timedelta(minutes=p50)
        metadata = registry.metadata()
        coverage = float(
            metadata.get("metrics", {}).get("test_intervals", {}).get("coverage", float("nan"))
        )

        return DelayPrediction(
            train_number=str(request.train_number),
            predicted_delay_minutes=p50,
            delay_p10_minutes=p10,
            delay_p50_minutes=p50,
            delay_p90_minutes=p90,
            predicted_eta=predicted_eta,
            eta_lower=anchor + timedelta(minutes=p10),
            eta_upper=anchor + timedelta(minutes=p90),
            predicted_remaining_minutes=max(
                0.0, (predicted_eta - self._as_utc(request.current_timestamp)).total_seconds() / 60.0
            ),
            delay_category=delay_band(p50),
            risk_level=risk_level,
            p_delay_gt_15=probability,
            confidence=coverage if math.isfinite(coverage) else 0.0,
            model_version=registry.model_version(),
            data_source=self._data_source(request),
            train_known_to_model=reference.knows(str(request.train_number)),
            unsupported_fields_ignored=self.ignored_fields(request),
        )

    @staticmethod
    def ignored_fields(request) -> list[str]:
        """Return the accepted-but-unused request fields that were populated.

        Per Gate 2 decision 2A these fields are accepted for forward
        compatibility, ignored by the model, and echoed back so the caller can
        see they had no effect.
        """
        populated = []
        for name in UNSUPPORTED_REQUEST_FIELDS:
            value = getattr(request, name, None)
            if value is not None and value != 0:
                populated.append(name)
        return populated

    @classmethod
    def _anchor(cls, request) -> datetime:
        """Return the UTC datetime the delay is measured against.

        MongoDB hands back naive datetimes, so a stored state would otherwise
        produce a naive ETA that a browser reads as local time.
        """
        return cls._as_utc(getattr(request, "scheduled_arrival", None) or request.current_timestamp)

    @staticmethod
    def _as_utc(moment: datetime) -> datetime:
        """Attach UTC to a naive datetime, leaving aware values untouched."""
        if moment.tzinfo is None:
            return moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc)

    @staticmethod
    def _data_source(request) -> str:
        return str(getattr(request, "data_source", None) or "LIVE")

    @staticmethod
    def _significant_delay_probability(registry: ModelRegistry, frame) -> float:
        classifier = registry.binary_classifier
        classes = list(classifier.classes_)
        index = classes.index("1") if "1" in classes else len(classes) - 1
        return float(np.asarray(classifier.predict_proba(frame))[0, index])

    @staticmethod
    def _major_probability(p50: float, p90: float) -> float:
        """Approximate P(MAJOR_PLUS) from the fitted quantiles.

        The four-class head was dropped at Gate 2 (f1_macro 0.20), so the
        probability of a major delay is read off the quantile spread: if P90
        is already past the major threshold the upper tail carries real mass.
        """
        major_threshold = 60.0
        if p50 >= major_threshold:
            return 0.9
        if p90 <= major_threshold:
            return 0.1
        span = max(p90 - p50, 1e-6)
        return float(min(0.9, max(0.1, 0.5 * (p90 - major_threshold) / span)))


delay_predictor = DelayPredictor()


def predict_delay(request) -> DelayPrediction:
    return delay_predictor.predict(request)
