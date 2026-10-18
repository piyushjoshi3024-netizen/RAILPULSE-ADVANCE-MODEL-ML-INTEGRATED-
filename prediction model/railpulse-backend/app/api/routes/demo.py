from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_demo_data_service, require_roles
from app.services.demo_data_service import DemoDataService

router = APIRouter()


@router.post("/seed")
async def seed_demo_data(
    demo: Annotated[DemoDataService, Depends(get_demo_data_service)],
    current_user: dict = Depends(require_roles("STAFF", "ADMIN")),
):
    result = await demo.seed()
    return result


@router.post("/refresh")
async def refresh_demo_data(
    demo: Annotated[DemoDataService, Depends(get_demo_data_service)],
    current_user: dict = Depends(require_roles("STAFF", "ADMIN")),
):
    result = await demo.refresh()
    return result


@router.post("/reset")
async def reset_demo_data(
    demo: Annotated[DemoDataService, Depends(get_demo_data_service)],
    current_user: dict = Depends(require_roles("ADMIN")),
):
    result = await demo.reset()
    return result


@router.delete("/seed")
async def delete_demo_seed_alias(
    demo: Annotated[DemoDataService, Depends(get_demo_data_service)],
    current_user: dict = Depends(require_roles("ADMIN")),
):
    result = await demo.reset()
    return result
