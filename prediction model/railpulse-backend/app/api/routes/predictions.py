import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    get_current_user,
    get_eta_service,
    get_prediction_repository,
    get_train_repository,
)
from app.db.repositories.prediction_repository import PredictionRepository
from app.db.repositories.train_repository import TrainRepository
from app.schemas.prediction import PredictionResponse
from app.schemas.train import TrainStateRequest
from app.services.eta_service import ETAService

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/eta", response_model=PredictionResponse)
async def predict_eta(
    request: TrainStateRequest,
    eta: Annotated[ETAService, Depends(get_eta_service)],
    predictions: Annotated[PredictionRepository, Depends(get_prediction_repository)],
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    current_user: dict = Depends(get_current_user),
):
    try:
        response = await eta.calculate(request)

        # Save prediction and input to MongoDB
        prediction_doc = {
            "train_number": request.train_number,
            "timestamp": predictions.timestamp(),
            "model_version": response.model_version,
            "input_snapshot": request.model_dump(mode="json"),
            "predicted_eta": response.predicted_eta,
            "predicted_remaining_minutes": response.predicted_remaining_minutes,
            "predicted_delay_minutes": response.predicted_delay_minutes,
            "delay_category": response.delay_category,
            "risk_level": response.risk_level,
        }
        await predictions.save(prediction_doc)
        await trains.upsert_live_state(request.train_number, request.model_dump(mode="json"))

        return response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Internal error during prediction: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
