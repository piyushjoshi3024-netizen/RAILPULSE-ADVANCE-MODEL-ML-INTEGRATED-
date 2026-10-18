"""FastAPI application factory and lifespan."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    alerts, auth, demo, docs, health, network, predictions, reference, simulation, trains,
)
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.db.mongodb import db
from app.db.repositories.user_repository import user_repository
from app.ml.model_registry import model_registry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TAGS_METADATA = [
    {"name": "Authentication", "description": "Registration, JWT login and the current user."},
    {"name": "Health", "description": "Component health, model provenance and measured quality."},
    {"name": "Predictions", "description": "ETA and delay prediction with quantiles and probabilities."},
    {"name": "Trains", "description": "Live train state, prediction history and destination ETA."},
    {"name": "Reference Data", "description": "Train and station lookups built from the training dataset."},
    {"name": "Demo Data", "description": "Demo live states derived from real dataset records."},
    {"name": "Simulation", "description": "Staff-supplied simulated states, stored separately from live."},
    {"name": "Network Intelligence", "description": "Capabilities that need data the dataset does not contain."},
    {"name": "Alerts", "description": "Stored operational alerts."},
    {"name": "Capability Documentation", "description": "What this backend can and cannot do, and why."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect the database, seed accounts and load the model.

    Every startup step degrades rather than aborting: the service comes up and
    reports its condition on /health instead of refusing to boot.
    """
    logger.info("Starting up FastAPI application...")
    try:
        await db.connect()
    except Exception as exc:
        logger.warning("MongoDB unavailable at startup: %s", exc)
    try:
        await db.ensure_indexes()
        await user_repository.seed_defaults(get_settings())
    except Exception as exc:
        logger.warning("Authentication initialization skipped: %s", exc)
    if model_registry.is_ready():
        logger.info("Model ready: version=%s", model_registry.model_version())
    else:
        logger.warning("Model unavailable: %s", model_registry.load_error())
    yield
    logger.info("Shutting down FastAPI application...")
    await db.close()


def create_app() -> FastAPI:
    """Build the configured FastAPI application."""
    settings = get_settings()

    application = FastAPI(
        title="RailPulse ETA Backend",
        description=(
            "FastAPI ML backend for RailPulse ETA prediction. Responses carry the model's "
            "provenance and measured quality, including whether it beats its baseline."
        ),
        version="3.0.0",
        lifespan=lifespan,
        openapi_tags=TAGS_METADATA,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_exception_handlers(application)

    prefix = settings.API_PREFIX
    application.include_router(auth.router, prefix=prefix + "/auth", tags=["Authentication"])
    application.include_router(health.router, prefix=prefix + "/health", tags=["Health"])
    application.include_router(predictions.router, prefix=prefix + "/predict", tags=["Predictions"])
    application.include_router(trains.router, prefix=prefix + "/trains", tags=["Trains"])
    application.include_router(reference.router, prefix=prefix + "/reference", tags=["Reference Data"])
    application.include_router(demo.router, prefix=prefix + "/demo", tags=["Demo Data"])
    application.include_router(simulation.router, prefix=prefix + "/simulation", tags=["Simulation"])
    application.include_router(network.router, prefix=prefix + "/network", tags=["Network Intelligence"])
    application.include_router(alerts.router, prefix=prefix + "/alerts", tags=["Alerts"])
    application.include_router(docs.router, prefix=prefix + "/docs", tags=["Capability Documentation"])

    return application


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
