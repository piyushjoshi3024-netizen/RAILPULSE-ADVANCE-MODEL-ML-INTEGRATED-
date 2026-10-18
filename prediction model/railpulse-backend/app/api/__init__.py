"""HTTP API layer: shared dependencies and routers."""

from app.api.dependencies import get_current_user, require_roles

__all__ = ["get_current_user", "require_roles"]
