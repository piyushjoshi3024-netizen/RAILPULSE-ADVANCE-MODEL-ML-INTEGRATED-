from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.mongodb import db
from app.main import app
from app.ml.predictor import DelayPrediction
from app.services import eta_service


def _install_stub_predictor(monkeypatch):
    """Replace the model with a fixed prediction so the API path is tested, not the model."""

    class StubPredictor:
        def predict(self, request):
            anchor = request.scheduled_arrival or request.current_timestamp
            return DelayPrediction(
                train_number=request.train_number,
                predicted_delay_minutes=25.0,
                delay_p10_minutes=10.0,
                delay_p50_minutes=25.0,
                delay_p90_minutes=60.0,
                predicted_eta=anchor + timedelta(minutes=25),
                eta_lower=anchor + timedelta(minutes=10),
                eta_upper=anchor + timedelta(minutes=60),
                predicted_remaining_minutes=120.0,
                delay_category="MODERATE",
                risk_level="MODERATE",
                p_delay_gt_15=0.7,
                confidence=0.8,
                model_version="test",
                data_source="DEMO",
                train_known_to_model=True,
                unsupported_fields_ignored=[],
            )

    monkeypatch.setattr(eta_service.default_eta_service, "_predictor", StubPredictor())


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
        return self.documents[:length]


class FakeCollection:
    def __init__(self):
        self.documents = []

    async def find_one(self, query, sort=None):
        matches = [document for document in self.documents if all(document.get(k) == v for k, v in query.items())]
        if sort and matches:
            field, direction = sort[0]
            matches.sort(key=lambda item: item.get(field, datetime.min), reverse=direction < 0)
        return matches[0] if matches else None

    async def insert_one(self, document):
        self.documents.append(document.copy())

    async def update_one(self, query, update, upsert=False):
        existing = next((document for document in self.documents if all(document.get(k) == v for k, v in query.items())), None)
        if existing is None:
            if upsert:
                self.documents.append({**query, **update["$set"]})
        else:
            existing.update(update["$set"])

    def find(self, query):
        matched = [document for document in self.documents if all(document.get(k) == v for k, v in query.items())]
        return FakeCursor(matched)

    async def count_documents(self, query):
        return len([document for document in self.documents if all(document.get(k) == v for k, v in query.items())])

    async def delete_many(self, query):
        before = len(self.documents)
        self.documents = [document for document in self.documents if not all(document.get(k) == v for k, v in query.items())]
        class DeleteResult:
            deleted_count = before - len(self.documents)
        return DeleteResult()

    async def create_index(self, *args, **kwargs):
        return "index"


class FakeDatabase:
    def __init__(self):
        self.collections = {
            name: FakeCollection()
            for name in (
                "users", "live_train_state", "simulation_states", "predictions", "alerts",
                "reference_trains",
            )
        }

    def __getitem__(self, name):
        return self.collections[name]

    async def command(self, command):
        return {"ok": 1}


def make_auth_client(monkeypatch, role="ADMIN"):
    fake_database = FakeDatabase()
    fake_database["users"].documents.append({
        "username": "admin1",
        "password_hash": hash_password("correct-password"),
        "role": "ADMIN",
        "full_name": "Admin User",
    })
    fake_database["users"].documents.append({
        "username": "staff1",
        "password_hash": hash_password("correct-password"),
        "role": "STAFF",
        "full_name": "Staff User",
    })
    fake_database["users"].documents.append({
        "username": "passenger1",
        "password_hash": hash_password("correct-password"),
        "role": "PASSENGER",
        "full_name": "Passenger User",
    })
    monkeypatch.setattr(db, "db", fake_database)
    client = TestClient(app)
    username = {
        "ADMIN": "admin1",
        "STAFF": "staff1",
        "PASSENGER": "passenger1",
    }.get(role, "admin1")
    login = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "correct-password"},
    )
    return client, fake_database, {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_demo_seed_requires_admin_or_staff(monkeypatch):
    client, _, headers = make_auth_client(monkeypatch, "STAFF")
    response = client.post("/api/v1/demo/seed", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["created_count"] >= 5


def test_demo_seed_rejects_passenger(monkeypatch):
    client, _, headers = make_auth_client(monkeypatch, "PASSENGER")
    response = client.post("/api/v1/demo/seed", headers=headers)
    assert response.status_code == 403


def test_demo_seed_is_idempotent(monkeypatch):
    client, fake_database, headers = make_auth_client(monkeypatch, "ADMIN")
    first = client.post("/api/v1/demo/seed", headers=headers)
    second = client.post("/api/v1/demo/seed", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["updated_count"] >= 1
    # Demo trains are derived from the dataset, so the count follows the data.
    seeded = first.json()["seeded_count"]
    assert seeded == second.json()["seeded_count"]
    assert len(fake_database["live_train_state"].documents) == seeded


def test_demo_reset_only_deletes_demo_records(monkeypatch):
    client, fake_database, headers = make_auth_client(monkeypatch, "ADMIN")
    fake_database["live_train_state"].documents.append({
        "train_number": "99999",
        "train_type": "Express",
        "destination": "Test",
        "current_timestamp": datetime.now(timezone.utc).isoformat(),
        "data_source": "LIVE",
    })
    seed = client.post("/api/v1/demo/seed", headers=headers)
    assert seed.status_code == 200

    reset = client.post("/api/v1/demo/reset", headers=headers)
    assert reset.status_code == 200
    assert reset.json()["deleted_count"] >= 5
    assert any(document["train_number"] == "99999" for document in fake_database["live_train_state"].documents)


def test_list_trains_and_state_work_for_seeded_demo(monkeypatch):
    client, _, headers = make_auth_client(monkeypatch, "ADMIN")
    seed = client.post("/api/v1/demo/seed", headers=headers)
    assert seed.status_code == 200

    trains = client.get("/api/v1/trains", headers=headers)
    assert trains.status_code == 200
    assert trains.json()["count"] >= 5

    state = client.get("/api/v1/trains/12301/state", headers=headers)
    assert state.status_code == 200
    assert state.json()["train_number"] == "12301"
    assert state.json()["data_source"] == "DEMO"


def test_prediction_works_for_seeded_demo_train(monkeypatch):
    client, fake_database, headers = make_auth_client(monkeypatch, "ADMIN")
    _install_stub_predictor(monkeypatch)
    seed = client.post("/api/v1/demo/seed", headers=headers)
    assert seed.status_code == 200

    state = client.get("/api/v1/trains/12301/state", headers=headers)
    payload = state.json()
    payload.pop("_id", None)
    prediction = client.post(
        "/api/v1/predict/eta",
        json={
            **payload,
            "current_timestamp": datetime.now(timezone.utc).isoformat(),
        },
        headers=headers,
    )
    assert prediction.status_code == 200
    assert prediction.json()["train_number"] == "12301"
    assert prediction.json()["risk_level"] in {"LOW", "MODERATE", "HIGH"}
    assert fake_database["predictions"].documents[0]["risk_level"] == prediction.json()["risk_level"]
