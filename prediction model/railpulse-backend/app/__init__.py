"""RailPulse FastAPI ML backend."""

__all__ = ["create_app"]


def __getattr__(name: str):
    """Expose the application factory without importing it at package import."""
    if name == "create_app":
        from app.main import create_app

        return create_app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
