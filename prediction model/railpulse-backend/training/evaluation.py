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


class RegressionEvaluator:
    """Point and interval metrics for delay regression."""

    @staticmethod
    def metrics(actual, predicted) -> dict[str, float]:
        """Return MAE, RMSE, median absolute error and r2."""
        actual = np.asarray(actual, dtype=float)
        predicted = np.asarray(predicted, dtype=float)
        return {
            "mae_minutes": float(mean_absolute_error(actual, predicted)),
            "rmse_minutes": float(np.sqrt(mean_squared_error(actual, predicted))),
            "median_ae_minutes": float(np.median(np.abs(actual - predicted))),
            "r2": float(r2_score(actual, predicted)),
        }

    @staticmethod
    def pinball_loss(actual, predicted, quantile: float) -> float:
        """Return the pinball (quantile) loss for one quantile level."""
        actual = np.asarray(actual, dtype=float)
        predicted = np.asarray(predicted, dtype=float)
        delta = actual - predicted
        return float(np.mean(np.maximum(quantile * delta, (quantile - 1) * delta)))

    @staticmethod
    def interval_coverage(actual, lower, upper) -> dict[str, float]:
        """Return empirical coverage and mean width of a prediction interval."""
        actual = np.asarray(actual, dtype=float)
        lower = np.asarray(lower, dtype=float)
        upper = np.asarray(upper, dtype=float)
        return {
            "coverage": float(np.mean((actual >= lower) & (actual <= upper))),
            "mean_width_minutes": float(np.mean(upper - lower)),
        }


class ClassificationEvaluator:
    """Discrimination and calibration metrics for the delay classifiers."""

    @staticmethod
    def binary_metrics(actual, probability, threshold: float = 0.5) -> dict[str, float]:
        """Return F1, PR-AUC, ROC-AUC, Brier score and accuracy."""
        from sklearn.metrics import (
            accuracy_score, average_precision_score, brier_score_loss, f1_score, roc_auc_score,
        )

        actual = np.asarray(actual, dtype=int)
        probability = np.asarray(probability, dtype=float)
        predicted = (probability >= threshold).astype(int)
        result = {
            "f1": float(f1_score(actual, predicted, zero_division=0)),
            "accuracy": float(accuracy_score(actual, predicted)),
            "brier": float(brier_score_loss(actual, probability)),
            "positive_rate": float(actual.mean()),
        }
        if len(np.unique(actual)) > 1:
            result["pr_auc"] = float(average_precision_score(actual, probability))
            result["roc_auc"] = float(roc_auc_score(actual, probability))
        else:
            result["pr_auc"] = float("nan")
            result["roc_auc"] = float("nan")
        return result

    @staticmethod
    def multiclass_metrics(actual, predicted, probabilities, labels) -> dict[str, float]:
        """Return macro/weighted F1, accuracy and multiclass log loss."""
        from sklearn.metrics import accuracy_score, f1_score, log_loss

        result = {
            "f1_macro": float(f1_score(actual, predicted, average="macro", zero_division=0)),
            "f1_weighted": float(f1_score(actual, predicted, average="weighted", zero_division=0)),
            "accuracy": float(accuracy_score(actual, predicted)),
        }
        try:
            result["log_loss"] = float(log_loss(actual, probabilities, labels=list(labels)))
        except ValueError:
            result["log_loss"] = float("nan")
        return result

    @staticmethod
    def calibration_curve(actual, probability, bins: int = 5) -> list[dict[str, float]]:
        """Return binned observed-vs-predicted frequencies for a reliability plot."""
        actual = np.asarray(actual, dtype=int)
        probability = np.asarray(probability, dtype=float)
        edges = np.linspace(0.0, 1.0, bins + 1)
        rows = []
        for low, high in zip(edges[:-1], edges[1:]):
            mask = (probability >= low) & (probability < high if high < 1.0 else probability <= high)
            if not mask.any():
                continue
            rows.append({
                "bin_lower": float(low),
                "bin_upper": float(high),
                "count": int(mask.sum()),
                "mean_predicted": float(probability[mask].mean()),
                "observed_rate": float(actual[mask].mean()),
            })
        return rows


class SegmentEvaluator:
    """Breaks regression error down by data segment."""

    @staticmethod
    def by_segment(frame: pd.DataFrame, actual_column: str, predicted_column: str,
                   segment_column: str) -> pd.DataFrame:
        """Return per-segment count, MAE and bias."""
        work = frame.copy()
        work["__abs_error__"] = (work[actual_column] - work[predicted_column]).abs()
        work["__bias__"] = work[predicted_column] - work[actual_column]
        grouped = work.groupby(segment_column).agg(
            count=("__abs_error__", "size"),
            mae_minutes=("__abs_error__", "mean"),
            bias_minutes=("__bias__", "mean"),
            actual_mean=(actual_column, "mean"),
        )
        return grouped.round(2).sort_values("mae_minutes", ascending=False)


class ConformalCalibrator:
    """Split-conformal prediction intervals from held-out residuals.

    Chosen over a parametric interval because it makes no distributional
    assumption and gives a finite-sample marginal coverage guarantee, which
    matters on a dataset this small.
    """

    def __init__(self, coverage: float = 0.8) -> None:
        self.coverage = coverage
        self.half_width_: float | None = None

    def fit(self, actual, predicted) -> "ConformalCalibrator":
        """Calibrate the interval half-width on held-out residuals."""
        residuals = np.abs(np.asarray(actual, dtype=float) - np.asarray(predicted, dtype=float))
        n = len(residuals)
        level = min(1.0, np.ceil((n + 1) * self.coverage) / n) if n else self.coverage
        self.half_width_ = float(np.quantile(residuals, level, method="higher"))
        return self

    def interval(self, predicted) -> tuple[np.ndarray, np.ndarray]:
        """Return (lower, upper) bounds, floored at zero minutes of delay."""
        if self.half_width_ is None:
            raise ValueError("ConformalCalibrator is not fitted")
        predicted = np.asarray(predicted, dtype=float)
        return np.maximum(0.0, predicted - self.half_width_), predicted + self.half_width_
