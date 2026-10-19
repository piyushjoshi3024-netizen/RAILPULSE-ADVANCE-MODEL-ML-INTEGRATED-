"""Train and station reference lookups backed by the training dataset."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_current_user, get_reference_service, require_roles
from app.services.reference_service import ReferenceDataService

router = APIRouter()


@router.get("/trains", summary="Search trains by number or name")
async def search_trains(
    reference: Annotated[ReferenceDataService, Depends(get_reference_service)],
    q: str = Query(default="", max_length=64, description="number or name fragment"),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Return matching trains for autocomplete."""
    results = await reference.search_trains(q, limit)
    return {"query": q, "count": len(results), "results": results}


@router.get("/stations", summary="Search stations by name")
async def search_stations(
    reference: Annotated[ReferenceDataService, Depends(get_reference_service)],
    q: str = Query(default="", max_length=64),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Return matching stations for autocomplete."""
    results = await reference.search_stations(q, limit)
    return {"query": q, "count": len(results), "results": results}


@router.get("/trains/{train_number}/route", summary="Route endpoints for a train")
async def get_route(
    train_number: str,
    reference: Annotated[ReferenceDataService, Depends(get_reference_service)],
    current_user: dict = Depends(get_current_user),
):
    """Return the origin/destination pair known for a train."""
    route = await reference.route_for(train_number)
    if route is None:
        raise HTTPException(status_code=404, detail="Train is not in the reference catalogue")
    return route


@router.post("/load", summary="Load the reference catalogue into MongoDB")
async def load_reference(
    reference: Annotated[ReferenceDataService, Depends(get_reference_service)],
    current_user: dict = Depends(require_roles("ADMIN")),
):
    """Idempotently (re)load the train catalogue from the cleaned dataset."""
    try:
        return await reference.load()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Cleaned dataset is not available; run `python3 -m training.pipeline` first",
        ) from exc
