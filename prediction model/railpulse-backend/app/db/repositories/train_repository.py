from datetime import datetime, timezone
from typing import Any

from app.db.mongodb import MongoDatabase
from app.db.repositories.base import BaseRepository


class TrainRepository(BaseRepository):
    """Persists live and simulated train state documents."""

    simulation_collection_name = "simulation_states"

    def __init__(self, database: MongoDatabase | None = None) -> None:
        super().__init__("live_train_state", database)

    @property
    def simulation_collection(self):
        """Return the collection holding simulated-only state documents."""
        return self.database.db[self.simulation_collection_name]

    async def upsert_live_state(self, train_number: str, state: dict[str, Any]) -> datetime:
        """Upsert the live state for a train and return the update timestamp."""
        updated_at = datetime.now(timezone.utc)
        document = {**state, "train_number": train_number, "state_source": "live", "updated_at": updated_at}
        await self.collection.update_one(
            {"train_number": train_number}, {"$set": document}, upsert=True
        )
        return updated_at

    async def get_live_state(self, train_number: str) -> dict[str, Any] | None:
        """Return the stored live state for a train, without its Mongo id."""
        document = await self.collection.find_one({"train_number": train_number})
        if document:
            document.pop("_id", None)
        return document

    async def upsert_simulation_state(self, train_number: str, state: dict[str, Any]) -> datetime:
        """Record a simulated state and mirror it into the live state collection."""
        simulated_at = datetime.now(timezone.utc)
        document = {
            **state,
            "train_number": train_number,
            "state_source": "simulation",
            "simulated_at": simulated_at,
        }
        await self.simulation_collection.update_one(
            {"train_number": train_number}, {"$set": document}, upsert=True
        )
        live_document = {
            **state,
            "train_number": train_number,
            "state_source": "simulation",
            "data_source": "SIMULATION",
            "updated_at": simulated_at,
            "simulated_at": simulated_at,
        }
        await self.collection.update_one(
            {"train_number": train_number}, {"$set": live_document}, upsert=True
        )
        return simulated_at

    async def list_live_states(self, limit: int = 1000) -> list[dict[str, Any]]:
        """Return the stored live states as the train list payload shape."""
        documents = await self.collection.find({}).sort("train_number", 1).to_list(length=limit)
        trains: list[dict[str, Any]] = []
        for document in documents:
            item = dict(document)
            item.pop("_id", None)
            trains.append({
                "train_number": item.get("train_number"),
                "train_name": item.get("train_name"),
                "train_type": item.get("train_type"),
                "source": item.get("source"),
                "destination": item.get("destination"),
                "current_station": item.get("current_station"),
                "current_section": item.get("current_section"),
                "current_delay_minutes": item.get("current_delay_minutes", 0),
                "current_speed_kmph": item.get("current_speed_kmph", 0),
                "distance_remaining_km": item.get("distance_remaining_km"),
                "scheduled_arrival": item.get("scheduled_arrival"),
                "data_source": item.get("data_source", "LIVE"),
                "updated_at": item.get("updated_at"),
            })
        return trains


train_repository = TrainRepository()


async def upsert_live_state(train_number: str, state: dict[str, Any]) -> datetime:
    return await train_repository.upsert_live_state(train_number, state)


async def get_live_state(train_number: str) -> dict[str, Any] | None:
    return await train_repository.get_live_state(train_number)


async def upsert_simulation_state(train_number: str, state: dict[str, Any]) -> datetime:
    return await train_repository.upsert_simulation_state(train_number, state)
