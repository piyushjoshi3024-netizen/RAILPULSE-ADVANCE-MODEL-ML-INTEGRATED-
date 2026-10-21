"""Shared paths, constants and seeds for the training pipeline."""

from __future__ import annotations

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RAW_DATA_PATH = os.path.join(BASE_DIR, "data", "indian_railway_delay_data_.csv")
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
CLEAN_DATA_PATH = os.path.join(PROCESSED_DIR, "journeys_clean.parquet")
RECONCILIATION_PATH = os.path.join(PROCESSED_DIR, "cleaning_reconciliation.csv")

MODELS_DIR = os.path.join(BASE_DIR, "models")
REGISTRY_DIR = os.path.join(MODELS_DIR, "registry")
LATEST_POINTER = os.path.join(MODELS_DIR, "latest.json")
LEGACY_MODEL_PATH = os.path.join(MODELS_DIR, "railpulse_eta_model.pkl")

REPORTS_DIR = os.path.join(BASE_DIR, "reports")
FIGURES_DIR = os.path.join(REPORTS_DIR, "figures")

RANDOM_SEED = 42
MODEL_VERSION = "delay-v3"

# Business definitions. These thresholds DEFINE training labels only; they are
# never used in place of a model prediction at inference time.
DELAY_BANDS: list[tuple[float, float, str]] = [
    (0.0, 5.0, "ON_TIME"),
    (5.0, 15.0, "MINOR"),
    (15.0, 60.0, "MODERATE"),
    (60.0, 120.0, "MAJOR"),
    (120.0, float("inf"), "SEVERE"),
]
SIGNIFICANT_DELAY_MINUTES = 15.0
QUANTILES = (0.1, 0.5, 0.9)


def delay_band(delay_minutes: float) -> str:
    """Return the business delay band for an observed or predicted delay."""
    for lower, upper, name in DELAY_BANDS:
        if delay_minutes <= upper and (delay_minutes > lower or lower == 0.0):
            return name
    return DELAY_BANDS[-1][2]
