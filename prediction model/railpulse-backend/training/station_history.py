"""Loader for per-station running history.

A running-history file records one row per train, date and station, with the
scheduled and actual arrival and departure at that stop. It is the dataset the
model card lists as the single most valuable addition: it is what makes
intermediate-station ETA and delay propagation learnable instead of stubs.

This module only loads, cleans and validates. Nothing here feeds the trip-level
training pipeline yet.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from training.cleaning import CleaningReport, CleaningStep, _strip_text, parse_clock_minutes
from training.dataset_config import DatasetConfig

logger = logging.getLogger(__name__)

MINUTES_PER_DAY = 1440

CANONICAL_COLUMNS = [
    "trip_id", "train_number", "journey_date", "station", "station_code", "station_sequence",
    "scheduled_arrival_minutes", "actual_arrival_minutes",
    "scheduled_departure_minutes", "actual_departure_minutes",
    "scheduled_arrival_at", "scheduled_departure_at",
    "arrival_delay_minutes", "departure_delay_minutes",
    "scheduled_dwell_minutes", "actual_dwell_minutes", "dwell_overrun_minutes",
    "is_origin", "is_destination",
]


@dataclass
class StationHistoryStats:
    """Headline facts about a loaded running history."""

    rows: int
    trips: int
    trains: int
    stations: int
    rows_dropped: int
    early_arrivals: int
    date_range: tuple[str, str] | None = None
    stops_per_trip: dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "rows": self.rows, "trips": self.trips, "trains": self.trains,
            "stations": self.stations, "rows_dropped": self.rows_dropped,
            "early_arrivals": self.early_arrivals, "date_range": self.date_range,
            "stops_per_trip": self.stops_per_trip,
        }


class StationHistoryLoader:
    """Reads and validates a per-station running-history file.

    Column names, date parsing and the early-arrival rule all come from the
    dataset config, so a new source file needs configuration rather than code.
    """

    def __init__(self, config: DatasetConfig | None = None, path: str | None = None) -> None:
        self.config = config or DatasetConfig()
        self.path = path or self.config.station_history_path
        self.report = CleaningReport()

    def load(self) -> tuple[pd.DataFrame, CleaningReport]:
        """Return the cleaned running history and its reconciliation report."""
        if not self.path:
            raise ValueError(
                "No station history configured. Set station_history_path in the dataset "
                "config, or pass path= to StationHistoryLoader."
            )
        if not os.path.exists(self.path):
            raise FileNotFoundError(f"Station history file not found: {self.path}")

        frame = self._read(self.path)
        rows = len(frame)
        frame.columns = [column.strip() for column in frame.columns]
        self.report.add(CleaningStep("load_station_history", rows, rows, 0, self.path))

        frame = self._rename(frame)
        frame = self._strip(frame)
        frame = self._parse(frame)
        frame = self._derive(frame)
        frame = self._drop_invalid(frame)
        frame = self._sequence(frame)
        frame = self._finalise(frame)
        return frame, self.report

    @staticmethod
    def _read(path: str) -> pd.DataFrame:
        if path.endswith(".parquet"):
            return pd.read_parquet(path)
        return pd.read_csv(path)

    def _rename(self, frame: pd.DataFrame) -> pd.DataFrame:
        mapping = {raw: canonical for raw, canonical in self.config.station_history_column_map.items()
                   if raw in frame.columns}
        renamed = frame.rename(columns=mapping)
        missing = [c for c in self.config.station_history_required_columns if c not in renamed.columns]
        if missing:
            raise ValueError(
                f"Station history is missing required columns after mapping: {missing}. "
                "Update station_history_column_map in the dataset config."
            )
        self.report.add(CleaningStep("rename_columns", len(frame), len(renamed), len(mapping),
                                     f"{len(mapping)} configured columns mapped"))
        return renamed

    def _strip(self, frame: pd.DataFrame) -> pd.DataFrame:
        text_columns = frame.select_dtypes(include=["object", "string"]).columns
        before = frame[text_columns].copy()
        for column in text_columns:
            frame[column] = frame[column].map(_strip_text)
        changed = int((before.astype(str).values != frame[text_columns].astype(str).values).sum())
        frame["train_number"] = frame["train_number"].astype(str).str.strip()
        self.report.add(CleaningStep("strip_whitespace", len(frame), len(frame), changed,
                                     "leading/trailing and non-breaking spaces"))
        return frame

    def _parse(self, frame: pd.DataFrame) -> pd.DataFrame:
        frame["journey_date"] = pd.to_datetime(
            frame["journey_date"], dayfirst=self.config.date_dayfirst, errors="coerce"
        )
        corrupt = 0
        for source, target in (
            ("scheduled_arrival_raw", "scheduled_arrival_minutes"),
            ("actual_arrival_raw", "actual_arrival_minutes"),
            ("scheduled_departure_raw", "scheduled_departure_minutes"),
            ("actual_departure_raw", "actual_departure_minutes"),
        ):
            if source in frame.columns:
                corrupt += int(frame[source].astype(str).str.contains("1900").sum())
                frame[target] = frame[source].map(parse_clock_minutes)
            else:
                frame[target] = np.nan
        self.report.add(CleaningStep("parse_times", len(frame), len(frame), corrupt,
                                     f"{corrupt} Excel 1900-epoch cells recovered"))
        return frame

    def _derive(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Compute arrival/departure delays and dwell times."""
        frame["arrival_delay_minutes"] = self._difference(
            frame["actual_arrival_minutes"], frame["scheduled_arrival_minutes"]
        )
        frame["departure_delay_minutes"] = self._difference(
            frame["actual_departure_minutes"], frame["scheduled_departure_minutes"]
        )
        frame["scheduled_dwell_minutes"] = self._dwell(
            frame["scheduled_departure_minutes"], frame["scheduled_arrival_minutes"]
        )
        frame["actual_dwell_minutes"] = self._dwell(
            frame["actual_departure_minutes"], frame["actual_arrival_minutes"]
        )
        frame["dwell_overrun_minutes"] = (
            frame["actual_dwell_minutes"] - frame["scheduled_dwell_minutes"]
        )
        frame["scheduled_arrival_at"] = frame["journey_date"] + pd.to_timedelta(
            frame["scheduled_arrival_minutes"], unit="m"
        )
        frame["scheduled_departure_at"] = frame["journey_date"] + pd.to_timedelta(
            frame["scheduled_departure_minutes"], unit="m"
        )
        early = int((frame["arrival_delay_minutes"] < 0).sum())
        self.report.add(CleaningStep("derive_delays", len(frame), len(frame), early,
                                     f"{early} early arrivals"
                                     f"{'' if self.config.allow_negative_delay else ' (negatives disabled)'}"))
        return frame

    def _difference(self, actual: pd.Series, scheduled: pd.Series) -> pd.Series:
        """Return actual-minus-scheduled, resolving midnight versus early."""
        raw = actual - scheduled
        values = raw.to_numpy(dtype=float)
        if not self.config.allow_negative_delay:
            resolved = np.where(values < 0, values + MINUTES_PER_DAY, values)
        else:
            tolerance = -abs(float(self.config.early_arrival_tolerance_minutes))
            resolved = np.where(values < tolerance, values + MINUTES_PER_DAY, values)
        return pd.Series(np.where(np.isnan(values), np.nan, resolved), index=raw.index)

    @staticmethod
    def _dwell(departure: pd.Series, arrival: pd.Series) -> pd.Series:
        """Return departure-minus-arrival at a stop, never negative."""
        raw = (departure - arrival).to_numpy(dtype=float)
        wrapped = np.where(raw < 0, raw + MINUTES_PER_DAY, raw)
        return pd.Series(np.where(np.isnan(raw), np.nan, wrapped), index=arrival.index)

    def _drop_invalid(self, frame: pd.DataFrame) -> pd.DataFrame:
        rows_in = len(frame)
        kept = frame.dropna(subset=["train_number", "journey_date", "station"])
        kept = kept[kept["station"].astype(str).str.len() > 0]
        # A stop with neither an arrival nor a departure observation is unusable.
        observed = kept["actual_arrival_minutes"].notna() | kept["actual_departure_minutes"].notna()
        kept = kept[observed]
        kept = kept.drop_duplicates(subset=["train_number", "journey_date", "station"])
        self.report.add(CleaningStep("drop_invalid", rows_in, len(kept), 0,
                                     "null keys, empty station, no observed time, duplicate stop"))
        return kept

    def _sequence(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Order stops within a trip and mark the origin and destination."""
        frame["trip_id"] = (
            frame["train_number"].astype(str) + "|" + frame["journey_date"].dt.date.astype(str)
        )
        if "station_sequence" in frame.columns and frame["station_sequence"].notna().all():
            frame["station_sequence"] = pd.to_numeric(frame["station_sequence"], errors="coerce")
            frame = frame.sort_values(["trip_id", "station_sequence"])
            detail = "ordered by the supplied station_sequence"
        else:
            # Fall back to the scheduled timeline, unwrapping an overnight run.
            frame = frame.sort_values(["trip_id", "scheduled_arrival_minutes"])
            frame["station_sequence"] = frame.groupby("trip_id").cumcount() + 1
            detail = "station_sequence derived from the scheduled timeline"
        frame = frame.reset_index(drop=True)
        position = frame.groupby("trip_id")["station_sequence"]
        frame["is_origin"] = (frame["station_sequence"] == position.transform("min")).astype(int)
        frame["is_destination"] = (frame["station_sequence"] == position.transform("max")).astype(int)
        self.report.add(CleaningStep("sequence_stops", len(frame), len(frame), 0, detail))
        return frame

    def _finalise(self, frame: pd.DataFrame) -> pd.DataFrame:
        for column in CANONICAL_COLUMNS:
            if column not in frame.columns:
                frame[column] = None
        frame = frame.loc[:, CANONICAL_COLUMNS]
        self.report.add(CleaningStep("finalise", len(frame), len(frame), 0,
                                     f"{len(CANONICAL_COLUMNS)} canonical columns"))
        return frame

    def stats(self, frame: pd.DataFrame) -> StationHistoryStats:
        """Return headline facts, for the EDA report and the model card."""
        dropped = int(self.report.to_frame()["rows_dropped"].sum())
        dates = frame["journey_date"].dropna()
        per_trip = frame.groupby("trip_id").size()
        return StationHistoryStats(
            rows=len(frame),
            trips=int(frame["trip_id"].nunique()),
            trains=int(frame["train_number"].nunique()),
            stations=int(frame["station"].nunique()),
            rows_dropped=dropped,
            early_arrivals=int((frame["arrival_delay_minutes"] < 0).sum()),
            date_range=(str(dates.min().date()), str(dates.max().date())) if len(dates) else None,
            stops_per_trip={
                "min": float(per_trip.min()) if len(per_trip) else 0.0,
                "mean": float(per_trip.mean()) if len(per_trip) else 0.0,
                "max": float(per_trip.max()) if len(per_trip) else 0.0,
            },
        )

    def write(self, frame: pd.DataFrame, path: str) -> str:
        """Write the cleaned running history to parquet."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        frame.to_parquet(path, index=False)
        logger.info("wrote station history rows=%d path=%s", len(frame), path)
        return path
