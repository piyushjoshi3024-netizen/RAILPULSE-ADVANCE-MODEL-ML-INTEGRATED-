"""Declarative dataset description.

Everything that is specific to *one* source file lives here: where it is, how
its columns are named, how its times and dates are written, and which derived
features the model should use. Swapping in a larger dataset is a config
change, not a code change - see ``docs/MODEL_CARD.md``.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field

from training.config import BASE_DIR, RAW_DATA_PATH

# Derived features the builder knows how to compute. A new dataset selects
# from this catalogue; it only needs code if it introduces a new *kind* of
# derivation rather than a new column name.
AVAILABLE_NUMERIC_FEATURES = [
    "distance_km",
    "scheduled_arrival_hour",
    "scheduled_arrival_minute",
    "scheduled_arrival_sin",
    "scheduled_arrival_cos",
    "day_of_week",
    "day_of_month",
    "day_of_year",
    "month",
    "is_weekend",
]
AVAILABLE_CATEGORICAL_FEATURES = [
    "train_number",
    "source",
    "destination",
    "run_frequency",
    "season",
    "train_type",
]


@dataclass
class DatasetConfig:
    """Describes one delay dataset end to end."""

    name: str = "indian_railway_delay_data_"
    raw_path: str = RAW_DATA_PATH
    expected_sha256: str | None = None

    # Raw column name -> canonical name used by the rest of the pipeline.
    column_map: dict[str, str] = field(default_factory=lambda: {
        "Train_id": "record_id",
        "Train_name": "train_name",
        "Train_no": "train_number",
        "Source": "source",
        "Destitnation": "destination",
        "Date": "journey_date",
        "Distance(Km)": "distance_km",
        "Sc_arr__time": "scheduled_arrival_raw",
        "Act_arr_time": "actual_arrival_raw",
        "Dealy_min": "delay_raw",
        "Season": "season",
        "Run_frequency": "run_frequency",
    })

    # Canonical columns that must exist after renaming.
    required_columns: list[str] = field(default_factory=lambda: [
        "train_number", "journey_date", "distance_km",
        "scheduled_arrival_raw", "delay_raw",
    ])

    date_column: str = "journey_date"
    date_dayfirst: bool = True
    # Columns written as HH:MM:SS (or an Excel-corrupted variant of it).
    clock_columns: list[str] = field(default_factory=lambda: [
        "scheduled_arrival_raw", "actual_arrival_raw", "delay_raw",
    ])
    delay_column: str = "delay_raw"
    delay_is_duration: bool = True
    scheduled_arrival_column: str = "scheduled_arrival_raw"
    actual_arrival_column: str | None = "actual_arrival_raw"

    # Value-level cleaning rules.
    category_aliases: dict[str, dict[str, str]] = field(default_factory=lambda: {
        "run_frequency": {
            "daliy": "DAILY", "daily": "DAILY",
            "weekly": "WEEKLY",
            "tri-weekly": "TRI_WEEKLY", "triweekly": "TRI_WEEKLY",
        },
    })
    uppercase_columns: list[str] = field(default_factory=lambda: ["season"])
    drop_duplicate_subset: list[str] = field(default_factory=lambda: [
        "train_number", "journey_date", "scheduled_arrival_minutes",
    ])
    allow_negative_delay: bool = False

    # Feature selection. Must be subsets of the AVAILABLE_* catalogues.
    numeric_features: list[str] = field(default_factory=lambda: [
        "distance_km", "scheduled_arrival_hour", "scheduled_arrival_minute",
        "scheduled_arrival_sin", "scheduled_arrival_cos",
        "day_of_week", "day_of_month", "is_weekend",
    ])
    categorical_features: list[str] = field(default_factory=lambda: [
        "train_number", "source", "destination", "run_frequency",
    ])
    # Why a candidate column is not used. Surfaced in the model card and /health.
    excluded_features: dict[str, str] = field(default_factory=lambda: {
        "season": "constant ('WINTER') in this dataset - zero variance",
        "month": "constant (January) in this dataset - zero variance",
        "year": "test period lies outside the training year range; a trend term would be extrapolation",
        "train_name": "redundant with train_number (1:1 mapping)",
    })

    def __post_init__(self) -> None:
        self.validate()

    def validate(self) -> None:
        """Raise when the configuration references unknown features."""
        unknown_numeric = set(self.numeric_features) - set(AVAILABLE_NUMERIC_FEATURES)
        unknown_categorical = set(self.categorical_features) - set(AVAILABLE_CATEGORICAL_FEATURES)
        if unknown_numeric:
            raise ValueError(f"Unknown numeric features: {sorted(unknown_numeric)}")
        if unknown_categorical:
            raise ValueError(f"Unknown categorical features: {sorted(unknown_categorical)}")
        if not self.numeric_features and not self.categorical_features:
            raise ValueError("At least one feature must be configured")

    @property
    def feature_columns(self) -> list[str]:
        """Return the ordered feature contract."""
        return list(self.numeric_features) + list(self.categorical_features)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "DatasetConfig":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in payload.items() if k in known})

    @classmethod
    def load(cls, path: str | None = None) -> "DatasetConfig":
        """Load a config from JSON, or return the built-in default."""
        if not path:
            return cls()
        with open(path) as handle:
            payload = json.load(handle)
        config = cls.from_dict(payload)
        if not os.path.isabs(config.raw_path):
            config.raw_path = os.path.join(BASE_DIR, config.raw_path)
        return config

    def save(self, path: str) -> str:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as handle:
            json.dump(self.to_dict(), handle, indent=2, sort_keys=True)
        return path
