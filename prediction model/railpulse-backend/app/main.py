from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import alerts, auth, demo, docs, network, predictions, health, trains, simulation
from app.db.mongodb import db
from app.db.repositories.user_repository import user_repository
from app.ml.model_registry import model_registry
from app.core.config import get_settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect the database, seed accounts and load the model bundle."""
    # Startup
    logger.info("Starting up FastAPI application...")
    await db.connect()
    try:
        await db.ensure_indexes()
        await user_repository.seed_defaults(get_settings())
    except Exception as exc:
        logger.warning("Authentication initialization skipped: %s", exc)
    model_registry.load()
    yield
    # Shutdown
    logger.info("Shutting down FastAPI application...")
    await db.close()


def create_app() -> FastAPI:
    """Build the configured FastAPI application."""
    settings = get_settings()

    application = FastAPI(
        title="RailPulse ETA Backend",
        description="FastAPI-only ML backend for RailPulse ETA prediction",
        version="1.0.0",
        lifespan=lifespan
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # Routes
    application.include_router(auth.router, prefix=settings.API_PREFIX + "/auth", tags=["Authentication"])
    application.include_router(health.router, prefix=settings.API_PREFIX + "/health", tags=["Health"])
    application.include_router(predictions.router, prefix=settings.API_PREFIX + "/predict", tags=["Predictions"])
    application.include_router(trains.router, prefix=settings.API_PREFIX + "/trains", tags=["Trains"])
    application.include_router(demo.router, prefix=settings.API_PREFIX + "/demo", tags=["Demo Data"])
    application.include_router(simulation.router, prefix=settings.API_PREFIX + "/simulation", tags=["Simulation"])
    application.include_router(network.router, prefix=settings.API_PREFIX + "/network", tags=["Network Intelligence"])
    application.include_router(alerts.router, prefix=settings.API_PREFIX + "/alerts", tags=["Alerts"])
    application.include_router(docs.router, prefix=settings.API_PREFIX + "/docs", tags=["Capability Documentation"])

    return application


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
