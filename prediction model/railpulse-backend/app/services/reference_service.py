"""Reference data (trains, routes) derived from the training dataset.

The dataset contains train-level journeys, so the reference catalogue it can
honestly support is train + route + schedule facts. Station sequences do not
exist in the data and are not invented.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from app.db.repositories.reference_repository import ReferenceRepository, reference_repository
from training.config import CLEAN_DATA_PATH

logger = logging.getLogger(__name__)


class ReferenceDataService:
    """Loads and queries the train/route catalogue."""

    def __init__(self, repository: ReferenceRepository | None = None) -> None:
        self._repository = repository if repository is not None else reference_repository

    @staticmethod
    def build_catalogue(frame: pd.DataFrame) -> list[dict[str, Any]]:
        """Collapse the journey table into one document per train."""
        grouped = frame.groupby("train_number")
        catalogue: list[dict[str, Any]] = []
        for train_number, rows in grouped:
            latest = rows.sort_values("journey_date").iloc[-1]
            catalogue.append({
                "train_number": str(train_number),
                "train_name": str(latest.get("train_name") or ""),
                "source": str(latest.get("source") or ""),
                "destination": str(latest.get("destination") or ""),
                "distance_km": float(latest.get("distance_km") or 0.0),
                "run_frequency": str(latest.get("run_frequency") or "UNKNOWN"),
                "scheduled_arrival_minutes": float(latest.get("scheduled_arrival_minutes") or 0.0),
                "observed_journeys": int(len(rows)),
                "observed_delay_mean_minutes": float(rows["delay_minutes"].mean()),
                "observed_delay_median_minutes": float(rows["delay_minutes"].median()),
                "first_seen": str(rows["journey_date"].min().date()),
                "last_seen": str(rows["journey_date"].max().date()),
                "data_source": "TRAINING_DATASET",
            })
        return sorted(catalogue, key=lambda item: item["train_number"])

    async def load(self, clean_path: str = CLEAN_DATA_PATH) -> dict[str, Any]:
        """Idempotently load the catalogue into MongoDB and return a summary."""
        frame = pd.read_parquet(clean_path)
        catalogue = self.build_catalogue(frame)
        await self._repository.ensure_indexes()
        result = await self._repository.replace_all(catalogue)
        logger.info("reference catalogue loaded trains=%d", len(catalogue))
        return {"trains": len(catalogue), **result}

    async def search_trains(self, query: str, limit: int) -> list[dict[str, Any]]:
        """Return trains whose number or name matches the query."""
        return await self._repository.search(query, limit)

    async def get_train(self, train_number: str) -> dict[str, Any] | None:
        """Return one train's reference record."""
        return await self._repository.get(train_number)

    async def search_stations(self, query: str, limit: int) -> list[dict[str, Any]]:
        """Return stations appearing as a source or destination."""
        return await self._repository.search_stations(query, limit)

    async def route_for(self, train_number: str) -> dict[str, Any] | None:
        """Return the origin/destination pair known for a train.

        The dataset has no intermediate station sequence, so this returns the
        two endpoints only and says so via ``stops_available``.
        """
        record = await self._repository.get(train_number)
        if record is None:
            return None
        return {
            "train_number": record["train_number"],
            "train_name": record.get("train_name", ""),
            "origin": record.get("source", ""),
            "destination": record.get("destination", ""),
            "distance_km": record.get("distance_km"),
            "run_frequency": record.get("run_frequency"),
            "stops_available": False,
            "limitation": (
                "The training dataset records origin and destination only; "
                "intermediate station sequences are not present and are not inferred."
            ),
        }


reference_data_service = ReferenceDataService()
