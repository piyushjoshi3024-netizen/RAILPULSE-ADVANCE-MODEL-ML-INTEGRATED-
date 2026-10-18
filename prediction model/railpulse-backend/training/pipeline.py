from __future__ import annotations

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

from app.ml.features import CATEGORICAL_FEATURES, NUMERIC_FEATURES

RANDOM_STATE = 42


class PipelineFactory:
    """Builds the preprocessing + XGBoost regression pipeline."""

    def __init__(self, random_state: int = RANDOM_STATE) -> None:
        self.random_state = random_state

    def build(self) -> Pipeline:
        """Return an unfitted scaler/one-hot + XGBRegressor pipeline."""
        preprocessor = ColumnTransformer(
            transformers=[
                ("numeric", StandardScaler(), NUMERIC_FEATURES),
                ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ]
        )
        estimator = XGBRegressor(
            objective="reg:squarederror",
            n_estimators=150,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=self.random_state,
            n_jobs=1,
        )
        return Pipeline([("preprocessor", preprocessor), ("model", estimator)])
