"""Every API call the frontend makes must exist in the OpenAPI schema."""

import pathlib
import re

import pytest

from app.main import app

FRONTEND_DIR = pathlib.Path(__file__).resolve().parents[2] / "railpulse-frontend" / "js"
API_PREFIX = "/api/v1"
METHODS = {"get": "GET", "post": "POST", "put": "PUT", "del": "DELETE"}


def frontend_calls() -> list[tuple[str, str]]:
    """Parse every api.<method>('<path>') call out of the frontend sources."""
    calls: set[tuple[str, str]] = set()
    for source in sorted(FRONTEND_DIR.glob("*.js")):
        text = source.read_text()
        for method, path in re.findall(r"api\.(get|post|put|del)\(\s*[`'\"]([^`'\"]+)[`'\"]", text):
            calls.add((METHODS[method], path))
    return sorted(calls)


def normalise(path: str) -> str:
    """Strip the query string and turn JS template slots into path params."""
    return re.sub(r"\$\{[^}]*\}", "{param}", path.split("?")[0])


def openapi_routes() -> set[tuple[str, str]]:
    spec = app.openapi()
    return {
        (method.upper(), re.sub(r"\{[^}]*\}", "{param}", path))
        for path, operations in spec["paths"].items()
        for method in operations
    }


def test_frontend_sources_are_discoverable():
    assert FRONTEND_DIR.is_dir(), f"frontend sources not found at {FRONTEND_DIR}"
    assert frontend_calls(), "no api.* calls were parsed from the frontend"


@pytest.mark.parametrize("method,path", frontend_calls())
def test_frontend_call_exists_in_openapi(method: str, path: str):
    target = (method, API_PREFIX + normalise(path))
    assert target in openapi_routes(), f"frontend calls {method} {path} but the API does not expose it"


def test_prediction_response_keeps_v2_fields():
    """Additive-only contract: every v2 response field must still be present."""
    schema = app.openapi()["components"]["schemas"]["PredictionResponse"]["properties"]
    for field in (
        "train_number", "predicted_eta", "predicted_remaining_minutes", "predicted_delay_minutes",
        "eta_lower", "eta_upper", "delay_category", "risk_level", "confidence", "model_version",
    ):
        assert field in schema, f"v2 response field {field} was removed"


def test_v3_fields_are_published():
    schema = app.openapi()["components"]["schemas"]["PredictionResponse"]["properties"]
    for field in ("delay_p10_minutes", "delay_p90_minutes", "p_delay_gt_15", "data_source", "model_quality"):
        assert field in schema
