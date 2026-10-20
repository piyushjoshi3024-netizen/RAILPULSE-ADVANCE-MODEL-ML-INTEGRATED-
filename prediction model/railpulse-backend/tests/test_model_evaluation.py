"""Tests for the ADMIN-only evaluation export route (gate D3).

Two things are pinned here. First the authorisation boundary, because hiding a
button is not authorisation: an anonymous caller must get 401 and a PASSENGER or
STAFF caller must get 403, regardless of what any page does. Second the absent
and unreadable cases, which must be indistinguishable to a caller and must never
surface a filesystem path or a stack trace.
"""

import json
import os

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.api.routes import model as model_route
from app.main import app


def _as(role: str):
    """Override the authenticated user, leaving require_roles to do its job."""
    return lambda: {"username": f"test-{role.lower()}", "role": role}


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def export(tmp_path, monkeypatch):
    """Point the route at a throwaway export so no real report is touched."""
    payload = {
        "schema_version": 1,
        "model": {"version": "delay-v3-test"},
        "dataset": {"name": "test_dataset", "rows": 10, "provenance": "synthetic"},
        "split": {"train_rows": 6, "validation_rows": 2, "test_rows": 2},
        "aggregates": {"beats_baseline": True},
        "candidates": [{"model": "random_forest", "cv_mae_minutes": 23.1}],
        "test_rows": [
            {"journey_date": "2025-12-28", "train_number": "12301", "actual_delay_minutes": 27.0,
             "p10": 0.8, "p50": 39.9, "p90": 63.8, "residual_minutes": 12.9},
            {"journey_date": "2025-12-29", "train_number": "12002", "actual_delay_minutes": 5.0,
             "p10": 1.0, "p50": 7.0, "p90": 30.0, "residual_minutes": 2.0},
        ],
    }
    path = tmp_path / "evaluation.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setattr(model_route, "EVALUATION_PATH", str(path))
    return payload


def test_anonymous_is_rejected(client, export):
    response = client.get("/api/v1/model/evaluation")
    assert response.status_code == 401


@pytest.mark.parametrize("role", ["PASSENGER", "STAFF"])
def test_non_admin_roles_are_forbidden(client, export, role):
    app.dependency_overrides[get_current_user] = _as(role)
    response = client.get("/api/v1/model/evaluation")
    assert response.status_code == 403
    # The body must not leak the export to a caller who may not have it.
    assert "test_rows" not in response.text


def test_admin_receives_the_export_verbatim(client, export):
    app.dependency_overrides[get_current_user] = _as("ADMIN")
    response = client.get("/api/v1/model/evaluation")
    assert response.status_code == 200
    assert response.json() == export


def test_missing_export_is_a_clean_404(client, tmp_path, monkeypatch):
    monkeypatch.setattr(model_route, "EVALUATION_PATH", str(tmp_path / "absent.json"))
    app.dependency_overrides[get_current_user] = _as("ADMIN")
    response = client.get("/api/v1/model/evaluation")
    assert response.status_code == 404
    assert response.json()["detail"] == "evaluation_unavailable"


def test_unreadable_export_looks_the_same_as_an_absent_one(client, tmp_path, monkeypatch):
    broken = tmp_path / "evaluation.json"
    broken.write_text("{ this is not json", encoding="utf-8")
    monkeypatch.setattr(model_route, "EVALUATION_PATH", str(broken))
    app.dependency_overrides[get_current_user] = _as("ADMIN")
    response = client.get("/api/v1/model/evaluation")
    assert response.status_code == 404
    assert response.json()["detail"] == "evaluation_unavailable"
    # No filesystem path and no parser internals in the response.
    assert str(tmp_path) not in response.text
    assert "JSONDecodeError" not in response.text


def test_authorisation_is_checked_before_the_file_is_read(client, tmp_path, monkeypatch):
    """A forbidden caller is refused even when there is no export at all."""
    monkeypatch.setattr(model_route, "EVALUATION_PATH", str(tmp_path / "absent.json"))
    app.dependency_overrides[get_current_user] = _as("STAFF")
    response = client.get("/api/v1/model/evaluation")
    assert response.status_code == 403


def test_route_is_read_only(client, export, tmp_path, monkeypatch):
    """The endpoint must not accept writes under any method."""
    app.dependency_overrides[get_current_user] = _as("ADMIN")
    for method in ("post", "put", "delete", "patch"):
        response = getattr(client, method)("/api/v1/model/evaluation")
        assert response.status_code == 405, method


def test_export_is_not_mutated_by_being_served(client, export, tmp_path, monkeypatch):
    path = model_route.EVALUATION_PATH
    before = os.path.getmtime(path)
    app.dependency_overrides[get_current_user] = _as("ADMIN")
    client.get("/api/v1/model/evaluation")
    client.get("/api/v1/model/evaluation")
    assert os.path.getmtime(path) == before
