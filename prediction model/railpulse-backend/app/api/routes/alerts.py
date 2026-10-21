from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_alert_repository, get_capability_service, get_current_user
from app.db.repositories.alert_repository import AlertRepository
from app.schemas.capabilities import AlertsResponse
from app.services.capability_service import CapabilityService

router = APIRouter()


@router.get("", response_model=AlertsResponse)
async def get_alerts(
    alerts: Annotated[AlertRepository, Depends(get_alert_repository)],
    capabilities: Annotated[CapabilityService, Depends(get_capability_service)],
    train_number: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    documents = await alerts.list(train_number, limit)
    if not documents:
        return AlertsResponse(**capabilities.unavailable_alerts())
    return AlertsResponse(
        status="available",
        data_source="mongodb_alerts_collection",
        alerts=[capabilities.alert_document_to_response(document) for document in documents],
    )
