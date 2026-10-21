"""Serving-side view of the shared feature contract.

The contract itself lives in :mod:`training.feature_contract` so the training
layer never imports ``app``. This module re-exports it unchanged, which keeps
the feature definition single-sourced: a model can never be fitted on one
definition and served on another.
"""

from training.feature_contract import (
    AVAILABLE_CATEGORICAL_FEATURES,
    AVAILABLE_NUMERIC_FEATURES,
    CATEGORICAL_FEATURES,
    EXCLUDED_FEATURES,
    FEATURE_COLUMNS,
    NUMERIC_FEATURES,
    UNSUPPORTED_REQUEST_FIELDS,
    JourneyFeatureBuilder,
    RouteReference,
)

__all__ = [
    "AVAILABLE_CATEGORICAL_FEATURES",
    "AVAILABLE_NUMERIC_FEATURES",
    "CATEGORICAL_FEATURES",
    "EXCLUDED_FEATURES",
    "FEATURE_COLUMNS",
    "JourneyFeatureBuilder",
    "NUMERIC_FEATURES",
    "RouteReference",
    "UNSUPPORTED_REQUEST_FIELDS",
]
