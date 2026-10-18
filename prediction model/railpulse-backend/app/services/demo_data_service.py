"""Demo live-train states built from real records in the training dataset.

Earlier versions hand-wrote five fictional trains. These states are derived
from the cleaned dataset's own trains, routes, distances and scheduled arrival
times, and every document is marked ``data_source: "DEMO"``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd

from app.db.repositories.train_repository import TrainRepository, train_repository
from app.schemas.train import TrainStateRequest
from training.config import CLEAN_DATA_PATH

logger = logging.getLogger(__name__)


class DemoDataService:
    """Generates, seeds and clears demo trains from real schedule records."""

    def __init__(
        self,
        repository: TrainRepository | None = None,
        clean_path: str = CLEAN_DATA_PATH,
    ) -> None:
        self._repository = repository if repository is not None else train_repository
        self._clean_path = clean_path
        self._specs: dict[str, dict[str, Any]] | None = None

    @property
    def collection(self):
        """Return the live train state collection used for demo documents."""
        return self._repository.collection

    def specs(self) -> dict[str, dict[str, Any]]:
        """Return one demo spec per train in the dataset, loaded once."""
        if self._specs is None:
            self._specs = self._load_specs()
        return self._specs

    def _load_specs(self) -> dict[str, dict[str, Any]]:
        """Derive demo specs from the cleaned dataset."""
        try:
            frame = pd.read_parquet(self._clean_path)
        except (FileNotFoundError, OSError) as exc:
            logger.warning("demo specs unavailable, clean dataset missing: %s", exc)
            return {}

        specs: dict[str, dict[str, Any]] = {}
        for train_number, rows in frame.groupby("train_number"):
            ordered = rows.sort_values("journey_date")
            latest = ordered.iloc[-1]
            specs[str(train_number)] = {
                "train_name": str(latest.get("train_name") or ""),
                "source": str(latest["source"]),
                "destination": str(latest["destination"]),
                "distance_km": float(latest["distance_km"]),
                "run_frequency": str(latest["run_frequency"]),
                "season": str(latest["season"]),
                "scheduled_arrival_minutes": float(latest["scheduled_arrival_minutes"]),
                "observed_delay_median": float(ordered["delay_minutes"].median()),
                "observed_journeys": int(len(ordered)),
            }
        logger.info("loaded %d demo specs from %s", len(specs), self._clean_path)
        return specs

    def build_state(
        self, train_number: str, base_time: datetime | None = None, delay_shift: int = 0
    ) -> dict[str, Any]:
        """Return the demo live-state document for one train."""
        spec = self.specs()[train_number]
        current_ts = base_time or datetime.now(timezone.utc)
        scheduled_arrival = self._next_scheduled_arrival(current_ts, spec["scheduled_arrival_minutes"])
        delay = max(0.0, float(spec["observed_delay_median"]) + float(delay_shift))
        return {
            "train_number": train_number,
            "train_name": spec["train_name"],
            "train_type": None,
            "current_timestamp": current_ts,
            "current_station": None,
            "current_section": None,
            "source": spec["source"],
            "destination": spec["destination"],
            "distance_remaining_km": spec["distance_km"],
            "current_delay_minutes": delay,
            "scheduled_arrival": scheduled_arrival,
            "run_frequency": spec["run_frequency"],
            "season": spec["season"],
            "observed_journeys": spec["observed_journeys"],
            "data_source": "DEMO",
            "state_source": "live",
            "updated_at": current_ts,
        }

    @staticmethod
    def _next_scheduled_arrival(moment: datetime, minutes_past_midnight: float) -> datetime:
        """Return the next occurrence of the train's scheduled arrival time."""
        candidate = moment.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
            minutes=float(minutes_past_midnight)
        )
        if candidate <= moment:
            candidate += timedelta(days=1)
        return candidate

    def generate_train_state(
        self, train_number: str, current_timestamp: datetime | None = None, delay_shift: int = 0
    ) -> TrainStateRequest:
        """Return one demo train as a validated train-state request."""
        return TrainStateRequest(**self.build_state(train_number, current_timestamp, delay_shift))

    def generate_trains(self, current_timestamp: datetime | None = None) -> list[TrainStateRequest]:
        """Return every demo train as a validated train-state request."""
        base = current_timestamp or datetime.now(timezone.utc)
        return [
            self.generate_train_state(train_number, base, delay_shift=(index * 2))
            for index, train_number in enumerate(self.specs())
        ]

    async def seed(self, current_timestamp: datetime | None = None) -> dict[str, Any]:
        """Upsert every demo train and report created/updated counts."""
        base = current_timestamp or datetime.now(timezone.utc)
        collection = self.collection
        created_count = updated_count = 0
        trains: list[str] = []

        for train_number in self.specs():
            existing = await collection.find_one({"train_number": train_number})
            document = self.build_state(train_number, base)
            await collection.update_one({"train_number": train_number}, {"$set": document}, upsert=True)
            trains.append(train_number)
            if existing:
                updated_count += 1
            else:
                created_count += 1

        total_count = len(trains)
        return {
            "success": True,
            "created_count": created_count,
            "updated_count": updated_count,
            "seeded_count": total_count,
            "total_count": total_count,
            "trains": trains,
            "message": f"Seeded {total_count} demo trains from the training dataset",
        }

    async def refresh(self, current_timestamp: datetime | None = None) -> dict[str, Any]:
        """Advance the stored demo trains that are already seeded."""
        base = current_timestamp or datetime.now(timezone.utc)
        collection = self.collection
        refreshed: list[str] = []

        for index, train_number in enumerate(self.specs()):
            existing = await collection.find_one({"train_number": train_number, "data_source": "DEMO"})
            if not existing:
                continue
            document = self.build_state(train_number, base, delay_shift=(index + 2) * 3)
            await collection.update_one({"train_number": train_number}, {"$set": document}, upsert=True)
            refreshed.append(train_number)

        return {
            "success": True,
            "updated_count": len(refreshed),
            "trains": refreshed,
            "message": "Demo live train data refreshed successfully",
        }

    async def reset(self) -> dict[str, Any]:
        """Delete every demo-sourced live train document."""
        result = await self.collection.delete_many({"data_source": "DEMO"})
        return {
            "success": True,
            "deleted_count": getattr(result, "deleted_count", 0) or 0,
            "message": "Demo data cleared successfully",
        }


demo_data_service = DemoDataService()


def generate_demo_train_state(train_number: str, current_timestamp: datetime | None = None,
                              delay_shift: int = 0) -> TrainStateRequest:
    return demo_data_service.generate_train_state(train_number, current_timestamp, delay_shift)


def generate_demo_trains(current_timestamp: datetime | None = None) -> list[TrainStateRequest]:
    return demo_data_service.generate_trains(current_timestamp)


async def seed_demo_trains(current_timestamp: datetime | None = None) -> dict[str, Any]:
    return await demo_data_service.seed(current_timestamp)


async def refresh_demo_trains(current_timestamp: datetime | None = None) -> dict[str, Any]:
    return await demo_data_service.refresh(current_timestamp)


async def reset_demo_trains() -> dict[str, Any]:
    return await demo_data_service.reset()
