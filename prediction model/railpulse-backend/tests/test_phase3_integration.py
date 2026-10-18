import re
from copy import deepcopy
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.mongodb import db
from app.main import app


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, field, direction):
        self.documents.sort(key=lambda item: item.get(field, datetime.min), reverse=direction < 0)
        return self

    def skip(self, amount):
        self.documents = self.documents[amount:]
        return self

    def limit(self, amount):
        self.documents = self.documents[:amount]
        return self

    async def to_list(self, length):
        return deepcopy(self.documents[:length])


def matches(document, query):
    """Minimal query matcher supporting equality, $or and $regex."""
    for key, condition in query.items():
        if key == "$or":
            if not any(matches(document, clause) for clause in condition):
                return False
            continue
        value = document.get(key)
        if isinstance(condition, dict) and "$regex" in condition:
            flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
            if value is None or not re.search(condition["$regex"], str(value), flags):
                return False
            continue
        if value != condition:
            return False
    return True


class FakeCollection:
    def __init__(self):
        self.documents = []

    async def find_one(self, query, sort=None):
        found = [document for document in self.documents if matches(document, query)]
        if sort and found:
            field, direction = sort[0]
            found.sort(key=lambda item: item.get(field, datetime.min), reverse=direction < 0)
        return deepcopy(found[0]) if found else None

    async def insert_one(self, document):
        self.documents.append(deepcopy(document))

    async def update_one(self, query, update, upsert=False):
        existing = next((document for document in self.documents if matches(document, query)), None)
        if existing is None:
            if upsert:
                self.documents.append({**query, **deepcopy(update["$set"])})
        else:
            existing.update(deepcopy(update["$set"]))

    def find(self, query):
        return FakeCursor([document for document in self.documents if matches(document, query)])

    async def count_documents(self, query):
        return len([document for document in self.documents if matches(document, query)])

    async def create_index(self, *args, **kwargs):
        return "index"


class FakeDatabase:
    def __init__(self):
        self.collections = {name: FakeCollection() for name in (
            "users", "live_train_state", "simulation_states", "predictions", "alerts",
            "reference_trains",
        )}

    def __getitem__(self, name):
        return self.collections[name]

    async def command(self, command):
        return {"ok": 1}


def make_client(monkeypatch):
    fake_database = FakeDatabase()
    fake_database["users"].documents.append({
        "username": "staff1",
        "password_hash": hash_password("correct-password"),
        "role": "STAFF",
        "full_name": None,
    })
    monkeypatch.setattr(db, "db", fake_database)
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "staff1", "password": "correct-password"},
    )
    return client, fake_database, {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_phase3_documented_and_future_capabilities(monkeypatch):
    client, _, headers = make_client(monkeypatch)

    catalog = client.get("/api/v1/docs/capabilities")
    assert catalog.status_code == 200
    payload = catalog.json()
    # Destination ETA is now served by the model; only intermediate stops remain blocked.
    assert "intermediate_station_eta" in payload["future_data_required"]
    assert "destination_station_eta" in payload["available"]

    # With no reference route or live state stored, the honest envelope still applies.
    station_etas = client.get("/api/v1/trains/12345/upcoming-stations", headers=headers)
    assert station_etas.status_code == 200
    assert station_etas.json()["status"] == "future_data_required"
    assert station_etas.json()["upcoming_stations"] == []

    propagation = client.get("/api/v1/network/trains/12345/delay-propagation", headers=headers)
    assert propagation.status_code == 200
    assert propagation.json()["status"] == "future_data_required"
    assert propagation.json()["affected_trains"] == []

    risk = client.get("/api/v1/network/trains/12345/operational-risk", headers=headers)
    assert risk.status_code == 200
    assert risk.json()["status"] == "future_data_required"


def test_simulation_updates_live_state_and_remains_recorded(monkeypatch):
    client, fake_database, headers = make_client(monkeypatch)
    payload = {
        "train_number": "12345",
        "current_timestamp": "2026-09-25T12:00:00Z",
        "destination": "TestStation",
        "current_delay_minutes": 10,
    }

    simulation = client.post("/api/v1/simulation/update", json=payload, headers=headers)
    assert simulation.status_code == 200
    assert len(fake_database["simulation_states"].documents) == 1
    live_trains = client.get("/api/v1/trains", headers=headers)
    assert live_trains.status_code == 200
    assert live_trains.json()["count"] == 1
    assert live_trains.json()["trains"][0]["train_number"] == "12345"
    assert live_trains.json()["trains"][0]["data_source"] == "SIMULATION"
    assert fake_database["live_train_state"].documents[0]["state_source"] == "simulation"

    payload["current_delay_minutes"] = 15
    updated_simulation = client.post("/api/v1/simulation/update", json=payload, headers=headers)
    assert updated_simulation.status_code == 200
    live_trains = client.get("/api/v1/trains", headers=headers)
    assert live_trains.json()["count"] == 1
    assert live_trains.json()["trains"][0]["current_delay_minutes"] == 15
    assert len(fake_database["simulation_states"].documents) == 1


def test_prediction_history_is_paginated(monkeypatch):
    client, fake_database, headers = make_client(monkeypatch)
    timestamp = datetime.now(timezone.utc)
    fake_database["predictions"].documents.extend([
        {"train_number": "12345", "timestamp": timestamp, "predicted_delay_minutes": 2},
        {"train_number": "12345", "timestamp": timestamp, "predicted_delay_minutes": 7},
    ])

    response = client.get(
        "/api/v1/trains/12345/predictions?limit=1&skip=0",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["predictions"]) == 1


def test_network_intelligence_requires_staff_or_admin(monkeypatch):
    fake_database = FakeDatabase()
    fake_database["users"].documents.append({
        "username": "passenger1",
        "password_hash": hash_password("correct-password"),
        "role": "PASSENGER",
        "full_name": None,
    })
    monkeypatch.setattr(db, "db", fake_database)
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "passenger1", "password": "correct-password"},
    )
    response = client.get(
        "/api/v1/network/trains/12345/operational-risk",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert response.status_code == 403
