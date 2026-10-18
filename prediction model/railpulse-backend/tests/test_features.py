"""The feature contract is shared by training and inference, and is honest."""

from datetime import datetime, timezone

from app.ml.feature_builder import (
    EXCLUDED_FEATURES,
    UNSUPPORTED_REQUEST_FIELDS,
    JourneyFeatureBuilder,
    RouteReference,
)
from app.schemas.train import TrainStateRequest
from training.dataset_config import DatasetConfig
from training.profiling import load_clean


def _request(**overrides):
    payload = {
        "train_number": "12301",
        "current_timestamp": datetime(2026, 1, 5, 6, 0, tzinfo=timezone.utc),
        "destination": "New Delhi",
        "scheduled_arrival": datetime(2026, 1, 5, 18, 30, tzinfo=timezone.utc),
    }
    payload.update(overrides)
    return TrainStateRequest(**payload)


def test_training_and_inference_produce_the_same_columns():
    builder = JourneyFeatureBuilder()
    frame = builder.frame_from_training(load_clean().head(3))
    inference = builder.from_request(_request())
    assert list(frame.columns) == builder.feature_columns
    assert list(inference) == builder.feature_columns


def test_no_post_outcome_column_can_become_a_feature():
    builder = JourneyFeatureBuilder()
    for leaked in ("actual_arrival_minutes", "delay_minutes", "delay_minutes_computed", "is_significant_delay"):
        assert leaked not in builder.feature_columns
    assert "actual_arrival_minutes" in EXCLUDED_FEATURES


def test_feature_selection_follows_the_dataset_config():
    config = DatasetConfig(numeric_features=["distance_km"], categorical_features=["train_number"])
    builder = JourneyFeatureBuilder.from_config(config)
    assert builder.feature_columns == ["distance_km", "train_number"]
    assert list(builder.frame_from_training(load_clean().head(2)).columns) == ["distance_km", "train_number"]


def test_route_reference_handles_unknown_trains():
    reference = RouteReference.from_frame(load_clean())
    assert reference.knows("12301")
    assert not reference.knows("00000")
    assert reference.distance_for("00000") == reference.median_distance_km
    assert reference.distance_for("00000", fallback=123.0) == 123.0


def test_unsupported_request_fields_do_not_change_features():
    builder = JourneyFeatureBuilder()
    reference = RouteReference.from_frame(load_clean())
    plain = builder.from_request(_request(), reference)
    loaded = builder.from_request(
        _request(current_delay_minutes=250, track_occupancy=0.99, trains_in_section=9), reference
    )
    assert plain == loaded
    assert "current_delay_minutes" in UNSUPPORTED_REQUEST_FIELDS
