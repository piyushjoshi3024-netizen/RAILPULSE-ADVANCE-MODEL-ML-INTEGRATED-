import logging
from datetime import timedelta

from app.ml.model_registry import get_model_metadata, get_uncertainty_metadata
from app.ml.predictor import classify_delay, classify_risk, predict_eta_and_delay
from app.schemas.prediction import PredictionResponse
from app.schemas.train import TrainStateRequest
from app.services.feature_service import FeatureService

logger = logging.getLogger(__name__)


class ETAService:
    """Produces a calibrated ETA and delay prediction for a train state.

    The model entry points are called through this module's globals
    (``predict_eta_and_delay``, ``get_model_metadata``,
    ``get_uncertainty_metadata``) so they stay patchable per module.
    """

    def __init__(self, feature_service: FeatureService | None = None) -> None:
        self._features = feature_service if feature_service is not None else FeatureService()

    async def calculate(self, request: TrainStateRequest) -> PredictionResponse:
        """Return the prediction response for the supplied train state."""
        features = self._features.build(request)

        try:
            remaining_minutes, delay_minutes = predict_eta_and_delay(features)
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            raise ValueError("Failed to predict ETA due to model error.")

        prediction_time = request.current_timestamp
        predicted_eta = prediction_time + timedelta(minutes=float(remaining_minutes))

        uncertainty = get_uncertainty_metadata()
        interval_minutes = uncertainty.get("eta_interval_minutes")
        calibration_coverage = uncertainty.get("eta_calibration_coverage")
        if interval_minutes is None or calibration_coverage is None:
            raise ValueError("Model uncertainty metadata is unavailable.")

        eta_lower = predicted_eta - timedelta(minutes=float(interval_minutes))
        eta_upper = predicted_eta + timedelta(minutes=float(interval_minutes))

        delay_category = classify_delay(delay_minutes)
        risk_level = classify_risk(delay_minutes)

        metadata = get_model_metadata()
        version = metadata.get("version", "unknown")

        return PredictionResponse(
            train_number=request.train_number,
            predicted_eta=predicted_eta,
            predicted_remaining_minutes=float(remaining_minutes),
            predicted_delay_minutes=float(delay_minutes),
            eta_lower=eta_lower,
            eta_upper=eta_upper,
            delay_category=delay_category,
            risk_level=risk_level,
            confidence=float(calibration_coverage),
            model_version=version
        )


default_eta_service = ETAService()


async def calculate_eta(request: TrainStateRequest) -> PredictionResponse:
    return await default_eta_service.calculate(request)
