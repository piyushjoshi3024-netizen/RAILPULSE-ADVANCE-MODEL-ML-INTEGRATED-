from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

CALIBRATION_LEVEL = 0.90


class MetricsCalculator:
    """Computes the regression metrics reported for every model and baseline."""

    @staticmethod
    def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
        """Return MAE, RMSE and r2 for one prediction set."""
        return {
            "mae_minutes": float(mean_absolute_error(actual, predicted)),
            "rmse_minutes": float(np.sqrt(mean_squared_error(actual, predicted))),
            "r2": float(r2_score(actual, predicted)),
        }


class UncertaintyCalibrator:
    """Derives prediction intervals from validation absolute-error quantiles."""

    def __init__(self, level: float = CALIBRATION_LEVEL) -> None:
        self.level = level

    def calibrate(self, actual: pd.Series, predicted: np.ndarray) -> tuple[float, float]:
        """Return the (interval_minutes, empirical_coverage) pair."""
        absolute_errors = np.abs(actual.to_numpy() - predicted)
        quantile = float(np.quantile(absolute_errors, self.level, method="higher"))
        coverage = float(np.mean(absolute_errors <= quantile))
        return max(quantile, 1.0), coverage
