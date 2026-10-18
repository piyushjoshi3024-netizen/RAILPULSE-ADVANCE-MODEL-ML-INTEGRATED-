"""Consistent error envelope for every failure the API returns."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ServiceError(Exception):
    """Base class for errors that map onto a specific status code."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code = "internal_error"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class ModelUnavailableError(ServiceError):
    """Raised when no usable model is registered."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "model_unavailable"


def error_payload(detail: Any, error_code: str, status_code: int, path: str) -> dict[str, Any]:
    """Return the shared error envelope.

    ``detail`` is kept at the top level because the existing frontend reads
    ``payload.detail``; the extra fields are additive.
    """
    return {
        "detail": detail,
        "error": {"code": error_code, "status": status_code, "path": path},
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the handlers that produce the shared envelope."""

    @app.exception_handler(ServiceError)
    async def _service_error(request: Request, exc: ServiceError) -> JSONResponse:
        logger.warning("service error path=%s code=%s detail=%s", request.url.path, exc.error_code, exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.detail, exc.error_code, exc.status_code, request.url.path),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {400: "bad_request", 401: "unauthorized", 403: "forbidden",
                 404: "not_found", 409: "conflict", 503: "service_unavailable"}
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.detail, codes.get(exc.status_code, "http_error"),
                                  exc.status_code, request.url.path),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_payload(jsonable_encoder(exc.errors()), "validation_error", 422, request.url.path),
        )
