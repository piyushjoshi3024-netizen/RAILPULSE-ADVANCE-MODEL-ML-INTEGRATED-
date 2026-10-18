from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import (
    get_current_user,
    get_prediction_repository,
    get_train_repository,
    require_roles,
)
from app.db.repositories.prediction_repository import PredictionRepository
from app.db.repositories.train_repository import TrainRepository
from app.schemas.capabilities import (
    PredictionHistoryResponse,
    LiveStateUpdateResponse,
    UpcomingStationETAResponse,
)
from app.schemas.train import TrainListResponse, TrainStateRequest

router = APIRouter()


@router.get("")
async def list_trains(
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    current_user: dict = Depends(get_current_user),
):
    items = await trains.list_live_states(limit=1000)
    return TrainListResponse(count=len(items), trains=items)


@router.get("/{train_number}/state")
async def get_train_state(
    train_number: str,
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    current_user: dict = Depends(get_current_user),
):
    state = await trains.get_live_state(train_number)
    if not state:
        raise HTTPException(status_code=404, detail="Train state not found")

    return state

@router.get("/{train_number}/predictions/latest")
async def get_latest_prediction(
    train_number: str,
    predictions: Annotated[PredictionRepository, Depends(get_prediction_repository)],
    current_user: dict = Depends(get_current_user),
):
    prediction = await predictions.get_latest(train_number)
    if not prediction:
        raise HTTPException(status_code=404, detail="No predictions found for this train")

    return prediction


@router.get("/{train_number}/predictions", response_model=PredictionHistoryResponse)
async def get_prediction_history(
    train_number: str,
    repository: Annotated[PredictionRepository, Depends(get_prediction_repository)],
    limit: int = Query(default=20, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    predictions, total = await repository.list(train_number, limit, skip)
    return PredictionHistoryResponse(
        train_number=train_number,
        total=total,
        predictions=predictions,
    )


@router.put("/{train_number}/state", response_model=LiveStateUpdateResponse)
async def update_live_train_state(
    train_number: str,
    request: TrainStateRequest,
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    current_user: dict = Depends(require_roles("STAFF", "ADMIN")),
):
    updated_at = await trains.upsert_live_state(train_number, request.model_dump(mode="json"))
    return LiveStateUpdateResponse(
        status="accepted",
        train_number=train_number,
        updated_at=updated_at,
        source="live",
    )


@router.get("/{train_number}/upcoming-stations", response_model=UpcomingStationETAResponse)
async def get_upcoming_station_etas(
    train_number: str,
    current_user: dict = Depends(get_current_user),
):
    return UpcomingStationETAResponse(
        train_number=train_number,
        status="future_data_required",
        data_source="route_schedule_and_live_network_feed_required",
        limitation=(
            "Station sequence and station-level observations are not present in the current dataset; "
            "no station ETA is fabricated."
        ),
    )
