from __future__ import annotations

import json
import os
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from training.evaluation import CALIBRATION_LEVEL, MetricsCalculator, UncertaintyCalibrator
from training.data_loader import TrainingDataLoader
from training.pipeline import RANDOM_STATE, PipelineFactory
from training.splitter import ChronologicalTripGroupSplitter
from training.trainer import DATA_PATH, MODEL_PATH, ETAModelTrainer

__all__ = [
    "BASE_DIR",
    "CALIBRATION_LEVEL",
    "DATA_PATH",
    "MODEL_PATH",
    "RANDOM_STATE",
    "calibration_quantile",
    "create_pipeline",
    "load_training_data",
    "regression_metrics",
    "split_dataset",
    "train_and_evaluate",
]


def load_training_data(filepath: str) -> pd.DataFrame:
    """Load the engineered training frame from a CSV path."""
    return TrainingDataLoader(filepath).load()


def split_dataset(
    data: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split a training frame chronologically into train/validation/test."""
    return ChronologicalTripGroupSplitter().split(data)


def create_pipeline() -> Pipeline:
    """Build an unfitted preprocessing + XGBoost pipeline."""
    return PipelineFactory().build()


def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    """Return MAE, RMSE and r2 for one prediction set."""
    return MetricsCalculator.regression_metrics(actual, predicted)


def calibration_quantile(actual: pd.Series, predicted: np.ndarray) -> tuple[float, float]:
    """Return the calibrated interval and its empirical coverage."""
    return UncertaintyCalibrator().calibrate(actual, predicted)


def train_and_evaluate(
    data_path: str = DATA_PATH,
    model_path: str = MODEL_PATH,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Train the model, persist the bundle and return (bundle, metrics)."""
    return ETAModelTrainer(data_path=data_path, model_path=model_path).run()


if __name__ == "__main__":
    _, evaluation = train_and_evaluate()
    print(json.dumps(evaluation, indent=2, sort_keys=True))
