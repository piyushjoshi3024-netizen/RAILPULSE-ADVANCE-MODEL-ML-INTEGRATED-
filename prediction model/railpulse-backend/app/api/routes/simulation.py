from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_train_repository, require_roles
from app.db.repositories.train_repository import TrainRepository
from app.schemas.capabilities import SimulationStateResponse
from app.schemas.train import TrainStateRequest

router = APIRouter()

@router.post("/update", response_model=SimulationStateResponse)
async def update_simulation(
    request: TrainStateRequest,
    trains: Annotated[TrainRepository, Depends(get_train_repository)],
    current_user: dict = Depends(require_roles("STAFF", "ADMIN")),
):
    simulated_at = await trains.upsert_simulation_state(
        request.train_number, request.model_dump(mode="json")
    )

    return SimulationStateResponse(
        status="success",
        train_number=request.train_number,
        simulated_at=simulated_at,
        message=f"Simulated state updated for train {request.train_number}",
    )
