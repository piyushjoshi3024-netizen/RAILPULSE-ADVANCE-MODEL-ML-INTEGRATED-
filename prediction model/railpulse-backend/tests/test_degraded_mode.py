"""The service must degrade, never crash, when the model or database is absent."""

from fastapi.testclient import TestClient

from app.api.dependencies import get_eta_service, get_model_registry
from app.core.security import hash_password
from app.db.mongodb import db
from app.main import app
from app.ml.model_registry import ModelRegistry
from app.services.eta_service import ETAService
from tests.test_phase3_integration import FakeDatabase


class MissingArtifactReader:
    """Stands in for a registry whose artifact file is gone."""

    def load(self):
        return None, {}

    def pointer(self):
        return None


def _empty_registry() -> ModelRegistry:
    return ModelRegistry(MissingArtifactReader())


def _client(monkeypatch):
    database = FakeDatabase()
    database["users"].documents.append({
        "username": "admin1",
        "password_hash": hash_password("correct-password"),
        "role": "ADMIN",
        "full_name": None,
    })
    monkeypatch.setattr(db, "db", database)
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin1", "password": "correct-password"})
    return client, {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_registry_reports_not_ready_instead_of_raising():
    registry = _empty_registry()
    assert registry.is_ready() is False
    assert registry.load() == {}
    assert registry.load_error()
    assert registry.metadata() == {}
    assert registry.beats_baseline() is False


def test_health_degrades_and_explains_why(monkeypatch):
    client, _ = _client(monkeypatch)
    app.dependency_overrides[get_model_registry] = _empty_registry
    try:
        payload = client.get("/api/v1/health/").json()
    finally:
        app.dependency_overrides.pop(get_model_registry, None)

    assert payload["status"] == "degraded"
    assert payload["model"] == "error"
    assert payload["model_details"]["load_error"]
    assert payload["model_quality"]["notice"] == "No model registered"


def test_prediction_returns_a_clean_503_envelope(monkeypatch):
    client, headers = _client(monkeypatch)
    app.dependency_overrides[get_eta_service] = lambda: ETAService(registry=_empty_registry())
    try:
        response = client.post("/api/v1/predict/eta", headers=headers, json={
            "train_number": "12301",
            "current_timestamp": "2026-01-05T06:00:00Z",
            "destination": "New Delhi",
        })
    finally:
        app.dependency_overrides.pop(get_eta_service, None)

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "model_unavailable"
    assert "training.pipeline" in body["detail"]
    assert "Traceback" not in response.text


def test_upcoming_stations_stays_honest_without_a_model(monkeypatch):
    client, headers = _client(monkeypatch)
    app.dependency_overrides[get_eta_service] = lambda: ETAService(registry=_empty_registry())
    try:
        response = client.get("/api/v1/trains/12301/upcoming-stations", headers=headers)
    finally:
        app.dependency_overrides.pop(get_eta_service, None)

    assert response.status_code == 200
    assert response.json()["status"] == "future_data_required"
    assert response.json()["upcoming_stations"] == []


def test_empty_database_lists_no_trains(monkeypatch):
    client, headers = _client(monkeypatch)
    response = client.get("/api/v1/trains", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"count": 0, "trains": []}


def test_unknown_train_state_is_404_not_500(monkeypatch):
    client, headers = _client(monkeypatch)
    response = client.get("/api/v1/trains/does-not-exist/state", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_bad_timestamp_is_422_not_500(monkeypatch):
    client, headers = _client(monkeypatch)
    response = client.post("/api/v1/predict/eta", headers=headers, json={
        "train_number": "12301",
        "current_timestamp": "not-a-timestamp",
        "destination": "New Delhi",
    })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "Traceback" not in response.text


def test_missing_optional_fields_are_accepted(monkeypatch):
    """Only train_number, current_timestamp and destination are required."""
    client, headers = _client(monkeypatch)
    response = client.post("/api/v1/predict/eta", headers=headers, json={
        "train_number": "12301",
        "current_timestamp": "2026-01-05T06:00:00Z",
        "destination": "New Delhi",
    })
    assert response.status_code in {200, 503}  # 503 only when no artifact is registered
    assert response.status_code != 422
