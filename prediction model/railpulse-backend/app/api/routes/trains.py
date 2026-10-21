from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import (
    get_current_user,
    get_eta_service,
    get_prediction_repository,
    get_reference_service,
    get_train_repository,
    require_roles,
)
from app.db.repositories.prediction_repository import PredictionRepository
from app.db.repositories.train_repository import TrainRepository
from app.schemas.capabilities import (
    PredictionHistoryResponse,
    LiveStateUpdateResponse,
    UpcomingStationETA,
    UpcomingStationETAResponse,
)
from app.services.eta_service import ETAService
from app.services.reference_service import ReferenceDataService
from app.schemas.train import TrainListResponse, TrainStateRequest

router = APIRouter()


@router.get("", summary="List live train states")
async def list_trains(
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    limit: int = Query(default=1000, ge=1, le=1000, description="maximum rows to return"),
    skip: int = Query(default=0, ge=0, description="rows to skip"),
    current_user: dict = Depends(get_current_user),
):
    """Return the stored live train states, newest schedule first."""
    items = await trains.list_live_states(limit=limit + skip)
    page = items[skip: skip + limit]
    return TrainListResponse(count=len(page), trains=page)


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


@router.get("/{train_number}/upcoming-stations", response_model=UpcomingStationETAResponse,
            summary="Station ETAs for a train")
async def get_upcoming_station_etas(
    train_number: str,
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    reference: Annotated[ReferenceDataService, Depends(get_reference_service)],
    eta: Annotated[ETAService, Depends(get_eta_service)],
    current_user: dict = Depends(get_current_user),
):
    """Return the destination ETA from the model.

    The dataset records arrival at the destination only, so exactly one stop is
    returned. Intermediate station sequences are not in the data and are not
    invented; the limitation field says so.
    """
    route = await reference.route_for(train_number)
    state = await trains.get_live_state(train_number)
    if route is None or state is None:
        return UpcomingStationETAResponse(
            train_number=train_number,
            status="future_data_required",
            data_source="route_schedule_and_live_network_feed_required",
            limitation=(
                "No reference route or live state is stored for this train. "
                "Seed demo data or load the reference catalogue first."
            ),
        )

    try:
        prediction = await eta.calculate(TrainStateRequest(**_state_to_request(state)))
    except Exception:
        return UpcomingStationETAResponse(
            train_number=train_number,
            status="future_data_required",
            data_source="model_unavailable",
            limitation="The prediction model is not available; no station ETA is fabricated.",
        )

    return UpcomingStationETAResponse(
        train_number=train_number,
        status="available",
        data_source="training_dataset_route_plus_model",
        upcoming_stations=[UpcomingStationETA(
            station_name=route["destination"],
            predicted_eta=prediction.predicted_eta,
            confidence=prediction.confidence,
        )],
        limitation=(
            "Only the destination arrival is modelled: the dataset contains no intermediate "
            "station sequence, so no en-route stops are inferred."
        ),
    )


def _state_to_request(state: dict) -> dict:
    """Keep only the fields TrainStateRequest accepts."""
    allowed = set(TrainStateRequest.model_fields)
    return {key: value for key, value in state.items() if key in allowed}
