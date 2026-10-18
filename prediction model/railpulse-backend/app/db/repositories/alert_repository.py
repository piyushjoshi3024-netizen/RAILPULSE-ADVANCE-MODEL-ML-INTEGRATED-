from typing import Any

from app.db.mongodb import MongoDatabase
from app.db.repositories.base import BaseRepository


class AlertRepository(BaseRepository):
    """Queries stored network alert documents."""

    def __init__(self, database: MongoDatabase | None = None) -> None:
        super().__init__("alerts", database)

    async def list(self, train_number: str | None, limit: int) -> list[dict[str, Any]]:
        """Return the most recent alerts, optionally filtered by train."""
        query = {"train_number": train_number} if train_number else {}
        cursor = self.collection.find(query).sort("created_at", -1).limit(limit)
        alerts = await cursor.to_list(length=limit)
        for alert in alerts:
            alert.pop("_id", None)
        return alerts


alert_repository = AlertRepository()


async def list_alerts(train_number: str | None, limit: int) -> list[dict[str, Any]]:
    return await alert_repository.list(train_number, limit)
