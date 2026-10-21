"""Model training package for the RailPulse delay model."""

import importlib
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Exported name -> defining submodule. Resolved lazily so that importing
# `training.<module>` never triggers the whole package, which would create an
# import cycle with the shared feature contract in `app.ml`.
_EXPORTS = {
    "CalibratedDelayClassifier": "training.probabilistic",
    "ChronologicalDateSplitter": "training.splitter",
    "ClassificationEvaluator": "training.evaluation",
    "ConformalCalibrator": "training.evaluation",
    "DatasetConfig": "training.dataset_config",
    "DatasetFetcher": "training.download_data",
    "DatasetProfiler": "training.profiling",
    "DelayModelTrainer": "training.trainer",
    "ExperimentRunner": "training.experiments",
    "MetricsCalculator": "training.evaluation",
    "ModelRegistryReader": "training.registry",
    "ModelRegistryWriter": "training.registry",
    "ModelSelector": "training.selection",
    "ModelZoo": "training.models",
    "QuantileRegressorSet": "training.probabilistic",
    "RawDataCleaner": "training.cleaning",
    "RegressionEvaluator": "training.evaluation",
    "RiskPolicy": "training.probabilistic",
    "SegmentEvaluator": "training.evaluation",
    "TrainingPipeline": "training.pipeline",
}

__all__ = sorted(_EXPORTS)


def __getattr__(name: str):
    """Import an exported class on first access."""
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    return getattr(importlib.import_module(module_name), name)


def __dir__() -> list[str]:
    return sorted(set(globals()) | set(_EXPORTS))
