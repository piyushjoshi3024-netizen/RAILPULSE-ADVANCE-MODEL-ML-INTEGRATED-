"""Shared feature contract for delay prediction.

The same builder is used by the training pipeline and by the inference path,
so a feature can never be computed one way at fit time and another way at
serve time. Only information available *before* the train arrives is used.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping

import pandas as pd

NUMERIC_FEATURES = [
    "distance_km",
    "scheduled_arrival_hour",
    "scheduled_arrival_minute",
    "scheduled_arrival_sin",
    "scheduled_arrival_cos",
    "day_of_week",
    "day_of_month",
    "is_weekend",
]
CATEGORICAL_FEATURES = [
    "train_number",
    "source",
    "destination",
    "run_frequency",
]
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES

# Columns deliberately kept out of the model, with the reason. Surfaced in the
# model card and the /health payload so the exclusion is visible, not implicit.
EXCLUDED_FEATURES: dict[str, str] = {
    "season": "constant ('WINTER') in the whole dataset - zero variance",
    "month": "constant (January) in the whole dataset - zero variance",
    "year": "test period lies entirely outside the training year range; a trend term would be pure extrapolation",
    "train_name": "redundant with train_number (1:1 mapping)",
    "actual_arrival_minutes": "observed only after arrival - leakage",
    "delay_minutes_computed": "derived from the target - leakage",
    "current_delay_minutes": "not present in the training data; see UNSUPPORTED_REQUEST_FIELDS",
}

# Request fields the API accepts for forward compatibility but which provably
# cannot influence a prediction, because the training data contains no such
# observations. Echoed back to clients so the contract is honest.
UNSUPPORTED_REQUEST_FIELDS: tuple[str, ...] = (
    "train_priority",
    "current_speed_kmph",
    "current_delay_minutes",
    "elapsed_travel_time_minutes",
    "historical_route_delay_minutes",
    "historical_station_delay_minutes",
    "historical_section_time_minutes",
    "dwell_time_minutes",
    "track_occupancy",
    "junction_congestion",
    "platform_availability",
    "trains_in_section",
    "current_section",
)


@dataclass(frozen=True)
class RouteReference:
    """Route facts learned from the training window, used at inference time.

    The API receives ``distance_remaining_km`` (a live-position concept) while
    the model was trained on total route distance, so the route distance is
    looked up per train rather than taken from the request.
    """

    train_distance_km: dict[str, float]
    train_source: dict[str, str]
    train_destination: dict[str, str]
    train_run_frequency: dict[str, str]
    median_distance_km: float

    @classmethod
    def from_frame(cls, frame: pd.DataFrame) -> "RouteReference":
        """Build the reference table from a clean training frame."""
        grouped = frame.groupby("train_number")
        return cls(
            train_distance_km=grouped["distance_km"].median().astype(float).to_dict(),
            train_source=grouped["source"].agg(lambda s: s.mode().iat[0]).to_dict(),
            train_destination=grouped["destination"].agg(lambda s: s.mode().iat[0]).to_dict(),
            train_run_frequency=grouped["run_frequency"].agg(lambda s: s.mode().iat[0]).to_dict(),
            median_distance_km=float(frame["distance_km"].median()),
        )

    def distance_for(self, train_number: str, fallback: float | None = None) -> float:
        """Return the learned route distance, falling back for unknown trains."""
        if train_number in self.train_distance_km:
            return self.train_distance_km[train_number]
        if fallback is not None and fallback > 0:
            return float(fallback)
        return self.median_distance_km

    def knows(self, train_number: str) -> bool:
        """Return True when the train was seen during training."""
        return train_number in self.train_distance_km


class JourneyFeatureBuilder:
    """Builds the model feature row for a scheduled journey."""

    numeric_features = NUMERIC_FEATURES
    categorical_features = CATEGORICAL_FEATURES
    feature_columns = FEATURE_COLUMNS

    def from_training_row(self, row: Mapping[str, Any]) -> dict:
        """Build features from a cleaned training record."""
        scheduled_minutes = float(row["scheduled_arrival_minutes"])
        journey_date = pd.Timestamp(row["journey_date"])
        return self._assemble(
            distance_km=float(row["distance_km"]),
            scheduled_minutes=scheduled_minutes,
            moment=journey_date,
            train_number=str(row["train_number"]),
            source=str(row["source"]),
            destination=str(row["destination"]),
            run_frequency=str(row["run_frequency"]),
        )

    def from_request(self, request, reference: RouteReference | None = None) -> dict:
        """Build features from an API train-state request.

        ``scheduled_arrival`` is the anchor; when a caller omits it the current
        timestamp is used, which makes the prediction a 'delay relative to now'.
        """
        train_number = str(request.train_number)
        scheduled_at = getattr(request, "scheduled_arrival", None) or request.current_timestamp
        scheduled_at = pd.Timestamp(scheduled_at)
        scheduled_minutes = scheduled_at.hour * 60 + scheduled_at.minute + scheduled_at.second / 60.0

        if reference is not None:
            distance = reference.distance_for(train_number, getattr(request, "distance_remaining_km", None))
            source = request.source or reference.train_source.get(train_number, "Unknown")
            destination = request.destination or reference.train_destination.get(train_number, "Unknown")
            run_frequency = request.run_frequency or reference.train_run_frequency.get(train_number, "UNKNOWN")
        else:
            distance = float(getattr(request, "distance_remaining_km", None) or 0.0)
            source = request.source or "Unknown"
            destination = request.destination or "Unknown"
            run_frequency = request.run_frequency or "UNKNOWN"

        return self._assemble(
            distance_km=float(distance),
            scheduled_minutes=scheduled_minutes,
            moment=scheduled_at,
            train_number=train_number,
            source=str(source),
            destination=str(destination),
            run_frequency=self._normalise_frequency(run_frequency),
        )

    @staticmethod
    def _normalise_frequency(value: str) -> str:
        """Map a free-text run frequency onto the trained vocabulary."""
        cleaned = str(value).strip().upper().replace("-", "_").replace(" ", "_")
        aliases = {"DALIY": "DAILY", "TRI_WEEKLY": "TRI_WEEKLY", "TRIWEEKLY": "TRI_WEEKLY"}
        return aliases.get(cleaned, cleaned)

    def _assemble(
        self,
        distance_km: float,
        scheduled_minutes: float,
        moment: pd.Timestamp | datetime,
        train_number: str,
        source: str,
        destination: str,
        run_frequency: str,
    ) -> dict:
        """Assemble one ordered feature mapping."""
        angle = 2 * math.pi * (scheduled_minutes / 1440.0)
        moment = pd.Timestamp(moment)
        return {
            "distance_km": float(distance_km),
            "scheduled_arrival_hour": int(scheduled_minutes // 60),
            "scheduled_arrival_minute": int(scheduled_minutes % 60),
            "scheduled_arrival_sin": math.sin(angle),
            "scheduled_arrival_cos": math.cos(angle),
            "day_of_week": int(moment.dayofweek),
            "day_of_month": int(moment.day),
            "is_weekend": int(moment.dayofweek >= 5),
            "train_number": str(train_number),
            "source": str(source).strip(),
            "destination": str(destination).strip(),
            "run_frequency": str(run_frequency),
        }

    def frame_from_training(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Return the ordered feature matrix for a clean training frame."""
        rows = [self.from_training_row(row) for _, row in frame.iterrows()]
        return pd.DataFrame(rows).loc[:, FEATURE_COLUMNS]

    def frame_from_mapping(self, features: Mapping[str, Any]) -> pd.DataFrame:
        """Return a single-row ordered feature matrix for inference."""
        missing = [c for c in FEATURE_COLUMNS if c not in features]
        if missing:
            raise ValueError(f"Inference feature mismatch: missing={missing}")
        return pd.DataFrame([[features[c] for c in FEATURE_COLUMNS]], columns=FEATURE_COLUMNS)
