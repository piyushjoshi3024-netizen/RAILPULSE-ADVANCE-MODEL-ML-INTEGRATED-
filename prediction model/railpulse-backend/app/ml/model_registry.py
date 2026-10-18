import logging
import os

import joblib

from app.core.config import Settings, get_settings
from app.ml.features import FEATURE_COLUMNS

logger = logging.getLogger(__name__)


class ModelRegistry:
    """Loads, validates and caches the persisted ETA/delay model bundle.

    The bundle is held as instance state and loaded on first use, so importing
    this module never touches the filesystem.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings
        self._bundle: dict | None = None

    @property
    def settings(self) -> Settings:
        """Resolve settings lazily so configuration is read at call time."""
        return self._settings if self._settings is not None else get_settings()

    def load(self) -> dict:
        """Load and validate the bundle once; an invalid artifact yields {}."""
        if self._bundle is None:
            settings = self.settings
            try:
                if not os.path.exists(settings.MODEL_PATH):
                    raise FileNotFoundError(settings.MODEL_PATH)
                logger.info("Loading ML models from %s", settings.MODEL_PATH)
                bundle = joblib.load(settings.MODEL_PATH)
                self._validate(bundle, settings)
                self._bundle = bundle
            except Exception:
                logger.exception("Unable to load a valid model artifact from %s", settings.MODEL_PATH)
                self._bundle = {}
        return self._bundle

    @staticmethod
    def _validate(bundle: dict, settings: Settings) -> None:
        """Raise when the bundle does not satisfy the inference contract."""
        metadata = bundle.get("metadata", {})
        if not all(bundle.get(name) is not None for name in ("eta_pipeline", "delay_pipeline")):
            raise ValueError("Model bundle is missing required pipelines")
        if metadata.get("features") != FEATURE_COLUMNS:
            raise ValueError("Model feature metadata does not match the inference contract")
        if metadata.get("version") != settings.MODEL_VERSION:
            raise ValueError("Model artifact version does not match MODEL_VERSION")

    @property
    def eta_pipeline(self):
        """Return the fitted ETA regression pipeline, or None."""
        return self.load().get("eta_pipeline")

    @property
    def delay_pipeline(self):
        """Return the fitted delay regression pipeline, or None."""
        return self.load().get("delay_pipeline")

    def metadata(self) -> dict:
        """Return the bundle metadata, or an empty mapping."""
        return self.load().get("metadata", {})

    def uncertainty_metadata(self) -> dict:
        """Return the saved uncertainty calibration metadata."""
        return self.metadata().get("uncertainty", {})

    def is_ready(self) -> bool:
        """Return True when both pipelines and the metadata are available."""
        bundle = self.load()
        return bool(bundle.get("eta_pipeline") and bundle.get("delay_pipeline") and bundle.get("metadata"))


model_registry = ModelRegistry()


def load_models():
    return model_registry.load()


def get_eta_pipeline():
    return model_registry.eta_pipeline


def get_delay_pipeline():
    return model_registry.delay_pipeline


def get_model_metadata():
    return model_registry.metadata()


def get_uncertainty_metadata():
    return model_registry.uncertainty_metadata()


def is_model_ready() -> bool:
    return model_registry.is_ready()
