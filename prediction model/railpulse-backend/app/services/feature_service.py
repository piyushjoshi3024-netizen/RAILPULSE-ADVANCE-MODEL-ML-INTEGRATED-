"""Builds model features from an API request."""

from __future__ import annotations

from app.ml.feature_builder import JourneyFeatureBuilder, RouteReference
from app.ml.model_registry import ModelRegistry, model_registry
from app.schemas.train import TrainStateRequest


class FeatureService:
    """Turns a train-state request into the model's feature mapping.

    The feature list comes from the loaded artifact, so the service always
    builds exactly the columns the registered model was fitted on.
    """

    def __init__(self, registry: ModelRegistry | None = None) -> None:
        self._registry = registry if registry is not None else model_registry

    def builder(self) -> JourneyFeatureBuilder:
        """Return a builder matching the registered feature contract."""
        columns = self._registry.feature_columns()
        return JourneyFeatureBuilder.from_feature_list(columns) if columns else JourneyFeatureBuilder()

    def reference(self) -> RouteReference | None:
        """Return the route reference table from the artifact, if loaded."""
        return self._registry.route_reference

    def build(self, request: TrainStateRequest) -> dict:
        """Return the engineered inference features for the request."""
        return self.builder().from_request(request, self.reference())


feature_service = FeatureService()


def build_feature_vector(request: TrainStateRequest) -> dict:
    return feature_service.build(request)
