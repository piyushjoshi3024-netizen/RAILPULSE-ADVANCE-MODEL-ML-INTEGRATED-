"""Baselines and candidate estimators, all behind one Pipeline interface."""

from __future__ import annotations

from typing import Any, Iterable

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler, TargetEncoder

from app.ml.feature_builder import CATEGORICAL_FEATURES, NUMERIC_FEATURES
from training.config import RANDOM_SEED

HIGH_CARDINALITY_FEATURES = ["train_number", "source", "destination"]
LOW_CARDINALITY_FEATURES = [c for c in CATEGORICAL_FEATURES if c not in HIGH_CARDINALITY_FEATURES]


class GlobalMeanBaseline(BaseEstimator, RegressorMixin):
    """Predicts the training-set mean delay for every journey."""

    def fit(self, X: pd.DataFrame, y: Iterable[float]) -> "GlobalMeanBaseline":
        self.value_ = float(np.mean(y))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.full(len(X), self.value_)


class GlobalMedianBaseline(BaseEstimator, RegressorMixin):
    """Predicts the training-set median delay for every journey."""

    def fit(self, X: pd.DataFrame, y: Iterable[float]) -> "GlobalMedianBaseline":
        self.value_ = float(np.median(y))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.full(len(X), self.value_)


class GroupStatisticBaseline(BaseEstimator, RegressorMixin):
    """Predicts a per-group statistic, falling back to the global statistic.

    This is the 'what a dispatcher already knows' baseline: the historical
    average delay of this train, or of this route.
    """

    def __init__(self, group_columns: list[str] | None = None, statistic: str = "mean") -> None:
        self.group_columns = group_columns or ["train_number"]
        self.statistic = statistic

    def fit(self, X: pd.DataFrame, y: Iterable[float]) -> "GroupStatisticBaseline":
        frame = X.loc[:, self.group_columns].copy()
        frame["__target__"] = np.asarray(y, dtype=float)
        self.lookup_ = frame.groupby(self.group_columns)["__target__"].agg(self.statistic).to_dict()
        self.fallback_ = float(getattr(np, self.statistic)(frame["__target__"]))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        keys = X.loc[:, self.group_columns]
        if len(self.group_columns) == 1:
            lookup_keys = keys.iloc[:, 0]
        else:
            lookup_keys = list(map(tuple, keys.to_numpy()))
        return np.array([self.lookup_.get(key, self.fallback_) for key in lookup_keys], dtype=float)


class PreprocessorFactory:
    """Builds the ColumnTransformer shared by every candidate model."""

    def __init__(self, encoder: str = "onehot", seed: int = RANDOM_SEED,
                 target_type: str = "continuous") -> None:
        if encoder not in {"onehot", "target"}:
            raise ValueError(f"Unknown encoder: {encoder}")
        self.encoder = encoder
        self.seed = seed
        self.target_type = target_type

    def build(self) -> ColumnTransformer:
        """Return the fitted-on-demand preprocessing transformer."""
        if self.encoder == "onehot":
            categorical = [(
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            )]
        else:
            categorical = [
                (
                    "target_encoded",
                    TargetEncoder(target_type=self.target_type, random_state=self.seed),
                    HIGH_CARDINALITY_FEATURES,
                ),
                (
                    "one_hot",
                    OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                    LOW_CARDINALITY_FEATURES,
                ),
            ]
        return ColumnTransformer(
            transformers=[("numeric", StandardScaler(), NUMERIC_FEATURES), *categorical]
        )


class ModelZoo:
    """Named baselines and candidate pipelines with their search spaces."""

    def __init__(self, seed: int = RANDOM_SEED) -> None:
        self.seed = seed

    def baselines(self) -> dict[str, BaseEstimator]:
        """Return the reference predictors every candidate must beat."""
        return {
            "baseline_global_mean": GlobalMeanBaseline(),
            "baseline_global_median": GlobalMedianBaseline(),
            "baseline_per_train_mean": GroupStatisticBaseline(["train_number"], "mean"),
            "baseline_per_train_median": GroupStatisticBaseline(["train_number"], "median"),
            "baseline_per_route_median": GroupStatisticBaseline(["source", "destination"], "median"),
        }

    def candidates(self) -> dict[str, dict[str, Any]]:
        """Return candidate estimators with bounded parameter grids."""
        seed = self.seed
        return {
            "ridge": {
                "estimator": Ridge(random_state=None),
                "grid": {"model__alpha": [0.3, 1.0, 3.0, 10.0, 30.0]},
            },
            "random_forest": {
                "estimator": RandomForestRegressor(random_state=seed, n_jobs=1),
                "grid": {
                    "model__n_estimators": [200, 400],
                    "model__max_depth": [3, 5, None],
                    "model__min_samples_leaf": [1, 3],
                },
            },
            "hist_gradient_boosting": {
                "estimator": HistGradientBoostingRegressor(random_state=seed),
                "grid": {
                    "model__max_depth": [2, 3, None],
                    "model__learning_rate": [0.05, 0.1],
                    "model__max_iter": [150, 300],
                    "model__min_samples_leaf": [5, 10],
                },
            },
            "xgboost": {
                "estimator": self._xgboost(),
                "grid": {
                    "model__n_estimators": [150, 400],
                    "model__max_depth": [2, 3],
                    "model__learning_rate": [0.03, 0.08],
                    "model__subsample": [0.8, 1.0],
                },
            },
            "lightgbm": {
                "estimator": self._lightgbm(),
                "grid": {
                    "model__n_estimators": [150, 400],
                    "model__num_leaves": [7, 15],
                    "model__learning_rate": [0.03, 0.08],
                    "model__min_child_samples": [5, 10],
                },
            },
        }

    def _xgboost(self):
        from xgboost import XGBRegressor

        return XGBRegressor(
            objective="reg:squarederror", random_state=self.seed, n_jobs=1, verbosity=0
        )

    def _lightgbm(self):
        from lightgbm import LGBMRegressor

        return LGBMRegressor(random_state=self.seed, n_jobs=1, verbose=-1)

    def build_pipeline(self, estimator: BaseEstimator, encoder: str = "onehot",
                       target_type: str = "continuous") -> Pipeline:
        """Wrap an estimator in the shared preprocessing pipeline.

        ``target_type`` is forwarded to the target encoder: regression uses
        ``continuous`` while the classifiers need ``auto`` so string labels
        are encoded correctly.
        """
        return Pipeline(
            [
                ("preprocessor", PreprocessorFactory(encoder, self.seed, target_type).build()),
                ("model", estimator),
            ]
        )
