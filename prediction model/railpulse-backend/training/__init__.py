"""Model training package for the RailPulse ETA model."""

import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from training.data_loader import TrainingDataLoader
from training.evaluation import MetricsCalculator, UncertaintyCalibrator
from training.pipeline import PipelineFactory
from training.splitter import ChronologicalTripGroupSplitter
from training.trainer import ETAModelTrainer

__all__ = [
    "ChronologicalTripGroupSplitter",
    "ETAModelTrainer",
    "MetricsCalculator",
    "PipelineFactory",
    "TrainingDataLoader",
    "UncertaintyCalibrator",
]
