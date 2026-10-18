from app.ml.features import FeatureEngineer
from app.schemas.train import TrainStateRequest


class FeatureService:
    """Turns an API train-state request into a model feature mapping."""

    def __init__(self, engineer: FeatureEngineer | None = None) -> None:
        self._engineer = engineer if engineer is not None else FeatureEngineer()

    def build(self, request: TrainStateRequest) -> dict:
        """Return the engineered inference features for the request."""
        return self._engineer.build_inference_features(request)


feature_service = FeatureService()


def build_feature_vector(request: TrainStateRequest) -> dict:
    return feature_service.build(request)
