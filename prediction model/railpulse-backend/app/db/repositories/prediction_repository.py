from datetime import datetime, timezone
from typing import Any

from app.db.mongodb import MongoDatabase
from app.db.repositories.base import BaseRepository


class PredictionRepository(BaseRepository):
    """Stores and queries persisted ETA prediction records."""

    def __init__(self, database: MongoDatabase | None = None) -> None:
        super().__init__("predictions", database)

    async def save(self, document: dict[str, Any]) -> None:
        """Insert one prediction document."""
        await self.collection.insert_one(document)

    async def list(self, train_number: str, limit: int, skip: int) -> tuple[list[dict[str, Any]], int]:
        """Return a page of predictions for a train plus the total count."""
        collection = self.collection
        cursor = collection.find({"train_number": train_number}).sort("timestamp", -1).skip(skip).limit(limit)
        predictions = await cursor.to_list(length=limit)
        for prediction in predictions:
            prediction.pop("_id", None)
        total = await collection.count_documents({"train_number": train_number})
        return predictions, total

    async def get_latest(self, train_number: str) -> dict[str, Any] | None:
        """Return the most recent prediction for a train, if any."""
        prediction = await self.collection.find_one(
            {"train_number": train_number}, sort=[("timestamp", -1)]
        )
        if prediction:
            prediction.pop("_id", None)
        return prediction

    @staticmethod
    def timestamp() -> datetime:
        """Return the timestamp to store alongside a new prediction."""
        return datetime.now(timezone.utc)


prediction_repository = PredictionRepository()


async def save_prediction(document: dict[str, Any]) -> None:
    await prediction_repository.save(document)


async def list_predictions(train_number: str, limit: int, skip: int) -> tuple[list[dict[str, Any]], int]:
    return await prediction_repository.list(train_number, limit, skip)


async def get_latest_prediction(train_number: str) -> dict[str, Any] | None:
    return await prediction_repository.get_latest(train_number)


def prediction_timestamp() -> datetime:
    return PredictionRepository.timestamp()
