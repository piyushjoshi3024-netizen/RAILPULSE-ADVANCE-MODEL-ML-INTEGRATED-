import os
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_app_settings, get_database, get_model_registry
from app.core.config import Settings
from app.db.mongodb import MongoDatabase
from app.ml.model_registry import ModelRegistry

router = APIRouter()

@router.get("/")
async def health_check(
    database: Annotated[MongoDatabase, Depends(get_database)],
    registry: Annotated[ModelRegistry, Depends(get_model_registry)],
    settings: Annotated[Settings, Depends(get_app_settings)],
):
    # Check Mongo
    mongo_status = "ok"
    try:
        await database.db.command("ping")
    except Exception:
        mongo_status = "error"

    # Check Model
    metadata = registry.metadata()
    artifact_exists = os.path.exists(settings.MODEL_PATH)
    model_status = "ok" if metadata and artifact_exists and registry.is_ready() else "error"

    return {
        "status": "ok" if mongo_status == "ok" and model_status == "ok" else "degraded",
        "mongodb": mongo_status,
        "model": model_status,
        "model_version": metadata.get("version", "unknown"),
        "model_details": {
            "artifact_exists": artifact_exists,
            "features": metadata.get("features", []),
            "metrics": metadata.get("metrics", {}),
            "uncertainty": metadata.get("uncertainty", {}),
        }
    }
