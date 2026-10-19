"""Loads the registered delay model bundle for the API.

Nothing is loaded at import time; the first call resolves the ``latest``
pointer. A missing or invalid artifact degrades the service to an explicit
"not ready" state rather than raising at startup.
"""

from __future__ import annotations

import logging
from typing import Any

from training.registry import ModelRegistryReader

logger = logging.getLogger(__name__)

REQUIRED_BUNDLE_KEYS = ("quantile_models", "binary_classifier", "route_reference", "feature_columns")


class ModelRegistry:
    """Caches the loaded bundle and exposes its parts to the service layer."""

    def __init__(self, reader: ModelRegistryReader | None = None) -> None:
        self._reader = reader or ModelRegistryReader()
        self._bundle: dict[str, Any] | None = None
        self._load_error: str | None = None

    def load(self) -> dict[str, Any]:
        """Load and validate the bundle once; returns {} when unavailable."""
        if self._bundle is None:
            try:
                bundle, _ = self._reader.load()
                if bundle is None:
                    raise FileNotFoundError("no model is registered (models/latest.json missing or stale)")
                self._validate(bundle)
                self._bundle = bundle
                self._load_error = None
                logger.info("loaded model version=%s", bundle.get("metadata", {}).get("version"))
            except Exception as exc:
                self._load_error = str(exc)
                logger.warning("model unavailable: %s", exc)
                self._bundle = {}
        return self._bundle

    @staticmethod
    def _validate(bundle: dict[str, Any]) -> None:
        """Raise when the bundle does not satisfy the serving contract."""
        missing = [key for key in REQUIRED_BUNDLE_KEYS if bundle.get(key) is None]
        if missing:
            raise ValueError(f"Model bundle is missing required components: {missing}")
        metadata = bundle.get("metadata", {})
        if metadata.get("features") != bundle.get("feature_columns"):
            raise ValueError("Model feature metadata does not match the stored feature contract")

    def reload(self) -> dict[str, Any]:
        """Drop the cache and load again (used after a retrain)."""
        self._bundle = None
        return self.load()

    @property
    def quantile_models(self):
        return self.load().get("quantile_models")

    @property
    def binary_classifier(self):
        return self.load().get("binary_classifier")

    @property
    def baseline_model(self):
        return self.load().get("baseline_model")

    @property
    def route_reference(self):
        return self.load().get("route_reference")

    @property
    def risk_policy(self):
        return self.load().get("risk_policy")

    def feature_columns(self) -> list[str]:
        return list(self.load().get("feature_columns") or [])

    def metadata(self) -> dict[str, Any]:
        return self.load().get("metadata", {})

    def dataset_info(self) -> dict[str, Any]:
        """Return the dataset provenance recorded at training time."""
        return self.metadata().get("dataset", {})

    def data_provenance(self) -> str:
        """Return how the training data was obtained ('synthetic', 'unknown', ...)."""
        return str(self.metadata().get("data_provenance", "unknown"))

    def is_synthetic(self) -> bool:
        """Return True when the model was trained on generated data."""
        return self.data_provenance().lower() == "synthetic"

    def beats_baseline(self) -> bool:
        """Return whether the shipped model beat its baseline on the test set."""
        return bool(self.metadata().get("beats_baseline", False))

    def model_version(self) -> str:
        return str(self.metadata().get("version", "unknown"))

    def is_ready(self) -> bool:
        """Return True when a validated bundle is loaded."""
        bundle = self.load()
        return bool(bundle) and all(bundle.get(key) is not None for key in REQUIRED_BUNDLE_KEYS)

    def load_error(self) -> str | None:
        """Return the reason the model could not be loaded, if any."""
        self.load()
        return self._load_error


model_registry = ModelRegistry()


def get_model_registry() -> ModelRegistry:
    return model_registry


def get_model_metadata() -> dict[str, Any]:
    return model_registry.metadata()


def is_model_ready() -> bool:
    return model_registry.is_ready()
