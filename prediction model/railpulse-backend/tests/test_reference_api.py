"""Reference-data routes and the honest health payload."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.mongodb import db
from app.main import app
from app.services.reference_service import ReferenceDataService
from tests.test_phase3_integration import FakeDatabase


def _client(monkeypatch, role="ADMIN"):
    database = FakeDatabase()
    database["users"].documents.append({
        "username": "admin1",
        "password_hash": hash_password("correct-password"),
        "role": role,
        "full_name": None,
    })
    monkeypatch.setattr(db, "db", database)
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"username": "admin1", "password": "correct-password"})
    return client, database, {"Authorization": f"Bearer {login.json()['access_token']}"}


def _seed_reference(database):
    database["reference_trains"].documents.extend([
        {"train_number": "12301", "train_name": "Rajdhani Express", "source": "Howrah",
         "destination": "New Delhi", "distance_km": 1450.0, "run_frequency": "DAILY"},
        {"train_number": "12002", "train_name": "Shatabdi Express", "source": "New Delhi",
         "destination": "RANI KAMLAPATI", "distance_km": 707.0, "run_frequency": "DAILY"},
    ])


def test_reference_routes_require_authentication():
    client = TestClient(app)
    assert client.get("/api/v1/reference/trains?q=12").status_code == 401
    assert client.get("/api/v1/reference/stations?q=del").status_code == 401


def test_train_search_returns_matches(monkeypatch):
    client, database, headers = _client(monkeypatch)
    _seed_reference(database)
    response = client.get("/api/v1/reference/trains?q=12301", headers=headers)
    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["results"][0]["train_name"] == "Rajdhani Express"


def test_route_lookup_reports_missing_stop_sequence(monkeypatch):
    client, database, headers = _client(monkeypatch)
    _seed_reference(database)
    response = client.get("/api/v1/reference/trains/12301/route", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["origin"] == "Howrah" and payload["destination"] == "New Delhi"
    assert payload["stops_available"] is False
    assert "not present" in payload["limitation"]


def test_unknown_route_returns_404_envelope(monkeypatch):
    client, _, headers = _client(monkeypatch)
    response = client.get("/api/v1/reference/trains/00000/route", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert "detail" in response.json()


def test_health_reports_dataset_and_baseline_honestly(monkeypatch):
    client, _, _ = _client(monkeypatch)
    payload = client.get("/api/v1/health/").json()
    assert set(payload) >= {"status", "mongodb", "model", "dataset", "model_quality"}
    assert "beats_baseline" in payload["model_quality"]
    assert "rows" in payload["dataset"]


def test_validation_errors_use_the_shared_envelope(monkeypatch):
    client, _, headers = _client(monkeypatch)
    response = client.post("/api/v1/predict/eta", headers=headers, json={"train_number": "x"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_reference_catalogue_is_built_from_journeys():
    import pandas as pd

    frame = pd.DataFrame([
        {"train_number": "1", "train_name": "A", "source": "S", "destination": "D",
         "distance_km": 10.0, "run_frequency": "DAILY", "scheduled_arrival_minutes": 60.0,
         "journey_date": pd.Timestamp("2020-01-01"), "delay_minutes": 10.0},
        {"train_number": "1", "train_name": "A", "source": "S", "destination": "D",
         "distance_km": 10.0, "run_frequency": "DAILY", "scheduled_arrival_minutes": 60.0,
         "journey_date": pd.Timestamp("2020-01-02"), "delay_minutes": 30.0},
    ])
    catalogue = ReferenceDataService.build_catalogue(frame)
    assert len(catalogue) == 1
    assert catalogue[0]["observed_journeys"] == 2
    assert catalogue[0]["observed_delay_mean_minutes"] == 20.0
    assert catalogue[0]["data_source"] == "TRAINING_DATASET"
