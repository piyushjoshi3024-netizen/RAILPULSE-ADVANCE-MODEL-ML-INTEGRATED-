"""The predictor honours its serving contract."""

from datetime import datetime, timedelta, timezone

import pytest

from app.ml.model_registry import ModelRegistry
from app.ml.predictor import DelayPredictor, ModelNotReadyError
from app.schemas.train import TrainStateRequest

pytestmark = pytest.mark.skipif(
    not ModelRegistry().is_ready(),
    reason="no registered model; run `python -m training.pipeline` first",
)


def _request(**overrides):
    payload = {
        "train_number": "12301",
        "current_timestamp": datetime(2026, 1, 5, 6, 0, tzinfo=timezone.utc),
        "destination": "New Delhi",
        "scheduled_arrival": datetime(2026, 1, 5, 18, 30, tzinfo=timezone.utc),
    }
    payload.update(overrides)
    return TrainStateRequest(**payload)


def test_quantiles_are_ordered_and_non_negative():
    prediction = DelayPredictor().predict(_request())
    assert 0 <= prediction.delay_p10_minutes <= prediction.delay_p50_minutes <= prediction.delay_p90_minutes
    assert prediction.predicted_delay_minutes == prediction.delay_p50_minutes


def test_eta_window_matches_the_quantiles():
    prediction = DelayPredictor().predict(_request())
    anchor = datetime(2026, 1, 5, 18, 30, tzinfo=timezone.utc)
    assert prediction.predicted_eta == anchor + timedelta(minutes=prediction.delay_p50_minutes)
    assert prediction.eta_lower == anchor + timedelta(minutes=prediction.delay_p10_minutes)
    assert prediction.eta_upper == anchor + timedelta(minutes=prediction.delay_p90_minutes)
    assert prediction.eta_lower <= prediction.predicted_eta <= prediction.eta_upper


def test_probability_is_a_probability_and_risk_is_a_known_level():
    prediction = DelayPredictor().predict(_request())
    assert 0.0 <= prediction.p_delay_gt_15 <= 1.0
    assert prediction.risk_level in {"LOW", "MODERATE", "HIGH"}
    assert prediction.delay_category in {"ON_TIME", "MINOR", "MODERATE", "MAJOR", "SEVERE"}


def test_predictions_vary_between_trains():
    values = {
        round(DelayPredictor().predict(_request(train_number=number)).delay_p50_minutes, 4)
        for number in ("12301", "22832", "15906", "12002")
    }
    assert len(values) > 1, "model returned an identical delay for every train"


def test_unsupported_fields_are_reported_and_ignored():
    baseline = DelayPredictor().predict(_request())
    loaded = DelayPredictor().predict(_request(current_delay_minutes=300, track_occupancy=0.95))
    assert loaded.delay_p50_minutes == baseline.delay_p50_minutes
    assert "current_delay_minutes" in loaded.unsupported_fields_ignored


def test_unknown_train_is_served_and_flagged():
    prediction = DelayPredictor().predict(_request(train_number="00000"))
    assert prediction.train_known_to_model is False
    assert prediction.delay_p50_minutes >= 0


def test_naive_timestamps_are_returned_as_utc():
    prediction = DelayPredictor().predict(
        _request(current_timestamp=datetime(2026, 1, 5, 6, 0), scheduled_arrival=datetime(2026, 1, 5, 18, 30))
    )
    assert prediction.predicted_eta.tzinfo is not None


def test_missing_model_raises_model_not_ready():
    class EmptyReader:
        def load(self):
            return None, {}

    predictor = DelayPredictor(ModelRegistry(EmptyReader()))
    with pytest.raises(ModelNotReadyError):
        predictor.predict(_request())
