"""API route modules, one per capability area."""

from app.api.routes import (
    alerts,
    auth,
    demo,
    docs,
    health,
    network,
    predictions,
    reference,
    simulation,
    trains,
)

__all__ = [
    "alerts",
    "auth",
    "demo",
    "docs",
    "health",
    "network",
    "predictions",
    "reference",
    "simulation",
    "trains",
]
