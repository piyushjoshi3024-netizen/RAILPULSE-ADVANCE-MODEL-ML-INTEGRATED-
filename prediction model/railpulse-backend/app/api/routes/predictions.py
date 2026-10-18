"""ETA and delay prediction."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    get_current_user,
    get_eta_service,
    get_prediction_repository,
    get_train_repository,
)
from app.core.exceptions import ModelUnavailableError
from app.db.repositories.prediction_repository import PredictionRepository
from app.db.repositories.train_repository import TrainRepository
from app.ml.predictor import ModelNotReadyError
from app.schemas.prediction import PredictionResponse
from app.schemas.train import TrainStateRequest
from app.services.eta_service import ETAService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/eta", response_model=PredictionResponse, summary="Predict ETA and delay")
async def predict_eta(
    request: TrainStateRequest,
    eta: Annotated[ETAService, Depends(get_eta_service)],
    predictions: Annotated[PredictionRepository, Depends(get_prediction_repository)],
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    current_user: dict = Depends(get_current_user),
):
    """Return the delay quantiles, ETA range and delay probability for a train.

    Fields the model cannot use are accepted and echoed back in
    ``unsupported_fields_ignored`` rather than silently influencing nothing.
    """
    try:
        response = await eta.calculate(request)
    except ModelNotReadyError as exc:
        raise ModelUnavailableError(
            f"No usable model is registered: {exc}. Run `python -m training.pipeline`."
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Internal error during prediction: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error") from exc

    try:
        await predictions.save({
            "train_number": request.train_number,
            "timestamp": predictions.timestamp(),
            "model_version": response.model_version,
            "input_snapshot": request.model_dump(mode="json"),
            "predicted_eta": response.predicted_eta,
            "predicted_remaining_minutes": response.predicted_remaining_minutes,
            "predicted_delay_minutes": response.predicted_delay_minutes,
            "delay_p10_minutes": response.delay_p10_minutes,
            "delay_p90_minutes": response.delay_p90_minutes,
            "p_delay_gt_15": response.p_delay_gt_15,
            "delay_category": response.delay_category,
            "risk_level": response.risk_level,
            "data_source": response.data_source,
        })
        await trains.upsert_live_state(request.train_number, request.model_dump(mode="json"))
    except Exception as exc:
        # A storage failure must not discard a prediction the caller already has.
        logger.error("Failed to persist prediction for %s: %s", request.train_number, exc)

    return response
