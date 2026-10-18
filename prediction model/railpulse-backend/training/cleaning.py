"""Deterministic raw -> clean transformation with a row reconciliation report.

Every step records how many rows entered, how many left and how many cell
values were altered, so the clean dataset can be audited against the raw CSV.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from training.config import (
    CLEAN_DATA_PATH,
    PROCESSED_DIR,
    RAW_DATA_PATH,
    RECONCILIATION_PATH,
    SIGNIFICANT_DELAY_MINUTES,
    delay_band,
)

logger = logging.getLogger(__name__)

COLUMN_RENAMES = {
    "Train_id": "record_id",
    "Train_name": "train_name",
    "Train_no": "train_number",
    "Source": "source",
    "Destitnation": "destination",      # typo in the source file
    "Date": "journey_date",
    "Distance(Km)": "distance_km",
    "Sc_arr__time": "scheduled_arrival_raw",
    "Act_arr_time": "actual_arrival_raw",
    "Dealy_min": "delay_raw",           # typo in the source file; HH:MM:SS duration
    "Season": "season",
    "Run_frequency": "run_frequency",
}

RUN_FREQUENCY_MAP = {
    "daliy": "DAILY",      # typo in the source file
    "daily": "DAILY",
    "weekly": "WEEKLY",
    "tri-weekly": "TRI_WEEKLY",
    "triweekly": "TRI_WEEKLY",
}

TIME_PATTERN = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")
MINUTES_PER_DAY = 1440


@dataclass
class CleaningStep:
    """One auditable transformation applied to the dataset."""

    name: str
    rows_in: int
    rows_out: int
    cells_changed: int
    detail: str = ""

    @property
    def rows_dropped(self) -> int:
        return self.rows_in - self.rows_out


@dataclass
class CleaningReport:
    """Collects the per-step reconciliation for the whole cleaning run."""

    steps: list[CleaningStep] = field(default_factory=list)

    def add(self, step: CleaningStep) -> None:
        self.steps.append(step)
        logger.info(
            "clean step=%s rows_in=%d rows_out=%d dropped=%d cells_changed=%d %s",
            step.name, step.rows_in, step.rows_out, step.rows_dropped, step.cells_changed, step.detail,
        )

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "step": s.name,
                    "rows_in": s.rows_in,
                    "rows_out": s.rows_out,
                    "rows_dropped": s.rows_dropped,
                    "cells_changed": s.cells_changed,
                    "detail": s.detail,
                }
                for s in self.steps
            ]
        )


def parse_clock_minutes(value: object) -> float:
    """Parse a clock/duration cell into minutes.

    Tolerates the Excel 1900-epoch corruption present in the source file
    (for example ``01-01-1900 17:20``) by keeping only the time component.
    """
    text = str(value).strip()
    if not text or text.lower() in {"nan", "nat", "none"}:
        return np.nan
    token = text.split()[-1]
    if not TIME_PATTERN.match(token):
        return np.nan
    parts = token.split(":")
    hours, minutes = int(parts[0]), int(parts[1])
    seconds = int(parts[2]) if len(parts) == 3 else 0
    return hours * 60 + minutes + seconds / 60.0


def _strip_text(value: object) -> object:
    """Strip whitespace including non-breaking spaces from a text cell."""
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()
    return value


class RawDataCleaner:
    """Turns the raw delay CSV into a validated, typed journey table."""

    def __init__(self, raw_path: str = RAW_DATA_PATH) -> None:
        self.raw_path = raw_path
        self.report = CleaningReport()

    def clean(self) -> tuple[pd.DataFrame, CleaningReport]:
        """Return the cleaned journey frame and its reconciliation report."""
        frame = pd.read_csv(self.raw_path)
        rows = len(frame)
        frame.columns = [column.strip() for column in frame.columns]
        self.report.add(CleaningStep("load_raw", rows, rows, 0, f"{self.raw_path}"))

        frame = self._rename_columns(frame)
        frame = self._strip_whitespace(frame)
        frame = self._normalise_categories(frame)
        frame = self._parse_times(frame)
        frame = self._parse_dates(frame)
        frame = self._build_targets(frame)
        frame = self._drop_invalid(frame)
        frame = self._drop_duplicates(frame)
        frame = self._finalise(frame)
        return frame, self.report

    def _rename_columns(self, frame: pd.DataFrame) -> pd.DataFrame:
        missing = [c for c in COLUMN_RENAMES if c not in frame.columns]
        if missing:
            raise ValueError(f"Raw file is missing expected columns: {missing}")
        renamed = frame.rename(columns=COLUMN_RENAMES)
        self.report.add(
            CleaningStep("rename_typo_columns", len(frame), len(renamed), len(COLUMN_RENAMES),
                         "Destitnation->destination, Dealy_min->delay_raw")
        )
        return renamed

    def _strip_whitespace(self, frame: pd.DataFrame) -> pd.DataFrame:
        text_columns = frame.select_dtypes(include=["object", "string"]).columns
        before = frame[text_columns].copy()
        for column in text_columns:
            frame[column] = frame[column].map(_strip_text)
        changed = int((before.astype(str).values != frame[text_columns].astype(str).values).sum())
        self.report.add(
            CleaningStep("strip_whitespace", len(frame), len(frame), changed,
                         "leading/trailing and non-breaking spaces")
        )
        return frame

    def _normalise_categories(self, frame: pd.DataFrame) -> pd.DataFrame:
        before = frame["run_frequency"].copy()
        frame["run_frequency"] = (
            frame["run_frequency"].astype(str).str.lower().map(RUN_FREQUENCY_MAP).fillna("UNKNOWN")
        )
        changed = int((before.astype(str) != frame["run_frequency"].astype(str)).sum())
        frame["season"] = frame["season"].astype(str).str.upper()
        frame["train_number"] = frame["train_number"].astype(str).str.strip()
        self.report.add(
            CleaningStep("normalise_categories", len(frame), len(frame), changed,
                         "run_frequency 'Daliy'->DAILY, NBSP 'Tri-Weekly'->TRI_WEEKLY")
        )
        return frame

    def _parse_times(self, frame: pd.DataFrame) -> pd.DataFrame:
        corrupt = int(
            frame["scheduled_arrival_raw"].astype(str).str.contains("1900").sum()
            + frame["actual_arrival_raw"].astype(str).str.contains("1900").sum()
            + frame["delay_raw"].astype(str).str.contains("1900").sum()
        )
        frame["scheduled_arrival_minutes"] = frame["scheduled_arrival_raw"].map(parse_clock_minutes)
        frame["actual_arrival_minutes"] = frame["actual_arrival_raw"].map(parse_clock_minutes)
        frame["delay_minutes_stated"] = frame["delay_raw"].map(parse_clock_minutes)
        self.report.add(
            CleaningStep("parse_times", len(frame), len(frame), corrupt,
                         f"{corrupt} Excel 1900-epoch cells recovered to time-of-day")
        )
        return frame

    def _parse_dates(self, frame: pd.DataFrame) -> pd.DataFrame:
        frame["journey_date"] = pd.to_datetime(frame["journey_date"], dayfirst=True, errors="coerce")
        unparsed = int(frame["journey_date"].isna().sum())
        self.report.add(
            CleaningStep("parse_dates", len(frame), len(frame), 0, f"{unparsed} unparseable dates (dayfirst)")
        )
        return frame

    def _build_targets(self, frame: pd.DataFrame) -> pd.DataFrame:
        raw_difference = frame["actual_arrival_minutes"] - frame["scheduled_arrival_minutes"]
        # An actual arrival earlier on the clock than the schedule means the
        # train crossed midnight, not that it arrived a day early.
        frame["delay_minutes_computed"] = np.where(
            raw_difference < 0, raw_difference + MINUTES_PER_DAY, raw_difference
        )
        frame["delay_reconciled"] = (
            (frame["delay_minutes_stated"] - frame["delay_minutes_computed"]).abs() < 1e-6
        )
        mismatches = int((~frame["delay_reconciled"]).sum())

        # The stated delay column is the dataset's own label and is kept as the
        # target; mismatching rows are flagged rather than silently rewritten.
        frame["delay_minutes"] = frame["delay_minutes_stated"]
        frame["delay_band"] = frame["delay_minutes"].map(delay_band)
        frame["is_significant_delay"] = (frame["delay_minutes"] > SIGNIFICANT_DELAY_MINUTES).astype(int)
        frame["scheduled_arrival_at"] = frame["journey_date"] + pd.to_timedelta(
            frame["scheduled_arrival_minutes"], unit="m"
        )
        self.report.add(
            CleaningStep("build_targets", len(frame), len(frame), mismatches,
                         f"{mismatches} rows where stated delay != actual-scheduled (flagged, kept)")
        )
        return frame

    def _drop_invalid(self, frame: pd.DataFrame) -> pd.DataFrame:
        rows_in = len(frame)
        required = ["journey_date", "delay_minutes", "scheduled_arrival_minutes", "distance_km", "train_number"]
        kept = frame.dropna(subset=required)
        kept = kept[kept["delay_minutes"] >= 0]
        kept = kept[kept["distance_km"] > 0]
        self.report.add(
            CleaningStep("drop_invalid", rows_in, len(kept), 0,
                         "null key fields, negative delay or non-positive distance")
        )
        return kept

    def _drop_duplicates(self, frame: pd.DataFrame) -> pd.DataFrame:
        rows_in = len(frame)
        kept = frame.drop_duplicates(subset=["train_number", "journey_date", "scheduled_arrival_minutes"])
        self.report.add(
            CleaningStep("drop_duplicates", rows_in, len(kept), 0, "same train on the same date and schedule")
        )
        return kept

    def _finalise(self, frame: pd.DataFrame) -> pd.DataFrame:
        frame = frame.sort_values(["journey_date", "train_number"]).reset_index(drop=True)
        frame["trip_id"] = (
            frame["train_number"].astype(str) + "|" + frame["journey_date"].dt.date.astype(str)
        )
        columns = [
            "trip_id", "record_id", "train_number", "train_name", "source", "destination",
            "journey_date", "scheduled_arrival_at", "scheduled_arrival_minutes",
            "actual_arrival_minutes", "distance_km", "season", "run_frequency",
            "delay_minutes", "delay_minutes_stated", "delay_minutes_computed",
            "delay_reconciled", "delay_band", "is_significant_delay",
        ]
        frame = frame.loc[:, columns]
        self.report.add(CleaningStep("finalise", len(frame), len(frame), 0, f"{len(columns)} canonical columns"))
        return frame

    def write(self, frame: pd.DataFrame, path: str = CLEAN_DATA_PATH) -> str:
        """Write the clean frame to parquet and the reconciliation to CSV."""
        os.makedirs(PROCESSED_DIR, exist_ok=True)
        frame.to_parquet(path, index=False)
        self.report.to_frame().to_csv(RECONCILIATION_PATH, index=False)
        logger.info("wrote clean dataset rows=%d path=%s", len(frame), path)
        return path
