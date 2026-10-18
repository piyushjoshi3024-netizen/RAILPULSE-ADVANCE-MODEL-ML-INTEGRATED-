"""Repository for the train/route reference catalogue."""

from __future__ import annotations

import re
from typing import Any

from app.db.mongodb import MongoDatabase
from app.db.repositories.base import BaseRepository


class ReferenceRepository(BaseRepository):
    """Stores one document per train, used for search and route lookups."""

    def __init__(self, database: MongoDatabase | None = None) -> None:
        super().__init__("reference_trains", database)

    async def ensure_indexes(self) -> None:
        """Create the indexes backing train and station lookups."""
        if not self.is_connected:
            return
        await self.collection.create_index("train_number", unique=True)
        await self.collection.create_index("train_name")
        await self.collection.create_index([("source", 1), ("destination", 1)])

    async def replace_all(self, documents: list[dict[str, Any]]) -> dict[str, int]:
        """Upsert every catalogue document; safe to run repeatedly."""
        created = updated = 0
        for document in documents:
            existing = await self.collection.find_one({"train_number": document["train_number"]})
            await self.collection.update_one(
                {"train_number": document["train_number"]}, {"$set": document}, upsert=True
            )
            if existing:
                updated += 1
            else:
                created += 1
        return {"created": created, "updated": updated}

    async def get(self, train_number: str) -> dict[str, Any] | None:
        """Return one reference document without its Mongo id."""
        document = await self.collection.find_one({"train_number": str(train_number)})
        if document:
            document.pop("_id", None)
        return document

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Return trains matching a number or name fragment."""
        pattern = re.escape(query.strip())
        if not pattern:
            return []
        cursor = self.collection.find({
            "$or": [
                {"train_number": {"$regex": f"^{pattern}", "$options": "i"}},
                {"train_name": {"$regex": pattern, "$options": "i"}},
            ]
        }).limit(limit)
        results = await cursor.to_list(length=limit)
        for item in results:
            item.pop("_id", None)
        return results

    async def search_stations(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Return distinct stations seen as an origin or destination."""
        pattern = re.escape(query.strip())
        cursor = self.collection.find({} if not pattern else {
            "$or": [
                {"source": {"$regex": pattern, "$options": "i"}},
                {"destination": {"$regex": pattern, "$options": "i"}},
            ]
        }).limit(500)
        documents = await cursor.to_list(length=500)
        stations: dict[str, dict[str, Any]] = {}
        for document in documents:
            for role in ("source", "destination"):
                name = str(document.get(role) or "").strip()
                if not name or (pattern and pattern.lower().replace("\\", "") not in name.lower()):
                    continue
                entry = stations.setdefault(name, {"station_name": name, "serves_trains": 0})
                entry["serves_trains"] += 1
        return sorted(stations.values(), key=lambda item: item["station_name"])[:limit]


reference_repository = ReferenceRepository()
