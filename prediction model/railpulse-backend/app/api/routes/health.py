"""Service, database and model health."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_app_settings, get_database, get_model_registry
from app.core.config import Settings
from app.db.mongodb import MongoDatabase
from app.ml.model_registry import ModelRegistry

router = APIRouter()


def _quality_notice(ready: bool, rows: int, provenance: str) -> str:
    """One short, honest line about what the model was trained on."""
    if not ready:
        return "No model registered"
    if provenance.lower() == "synthetic":
        return (f"Prototype model, trained on {rows} rows of SYNTHETIC data - "
                "metrics demonstrate the pipeline, not real-world accuracy")
    return f"Prototype model, trained on a {rows}-row dataset"


@router.get("/", summary="Service, database and model health")
async def health_check(
    database: Annotated[MongoDatabase, Depends(get_database)],
    registry: Annotated[ModelRegistry, Depends(get_model_registry)],
    settings: Annotated[Settings, Depends(get_app_settings)],
):
    """Report component health plus honest model provenance and quality."""
    mongo_status = "ok"
    try:
        await database.db.command("ping")
    except Exception:
        mongo_status = "error"

    ready = registry.is_ready()
    metadata = registry.metadata()
    dataset = registry.dataset_info()
    metrics = metadata.get("metrics", {})
    model_status = "ok" if ready else "error"

    return {
        "status": "ok" if mongo_status == "ok" and model_status == "ok" else "degraded",
        "mongodb": mongo_status,
        "model": model_status,
        "model_version": metadata.get("version", "unknown"),
        "model_details": {
            "artifact_exists": ready,
            "load_error": registry.load_error(),
            "features": metadata.get("features", []),
            "excluded_features": metadata.get("excluded_features", {}),
            "unsupported_request_fields": metadata.get("unsupported_request_fields", []),
            "metrics": metrics,
            "uncertainty": {
                "method": "lightgbm_quantile_regression",
                "quantiles": metadata.get("quantiles", []),
                "eta_interval_minutes": metrics.get("test_intervals", {}).get("mean_width_minutes"),
                "eta_calibration_coverage": metrics.get("test_intervals", {}).get("coverage"),
            },
        },
        "dataset": {
            "name": dataset.get("name", "unknown"),
            "data_provenance": registry.data_provenance(),
            "rows": dataset.get("rows", 0),
            "distinct_trains": dataset.get("distinct_trains", 0),
            "date_range": dataset.get("date_range", []),
            "sha256": dataset.get("sha256", ""),
        },
        "model_quality": {
            "beats_baseline": registry.beats_baseline(),
            "test_mae_minutes": metrics.get("test_point_p50", {}).get("mae_minutes"),
            "baseline_mae_minutes": metrics.get("test_baseline_global_mean", {}).get("mae_minutes"),
            "interval_coverage": metrics.get("test_intervals", {}).get("coverage"),
            "data_provenance": registry.data_provenance(),
            "notice": _quality_notice(ready, int(dataset.get("rows", 0) or 0), registry.data_provenance()),
        },
        "environment": settings.ENVIRONMENT,
    }
