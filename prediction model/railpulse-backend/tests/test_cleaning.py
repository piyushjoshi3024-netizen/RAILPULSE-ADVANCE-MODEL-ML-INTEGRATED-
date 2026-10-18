"""Cleaning is deterministic, reconciles every row and fixes known defects."""

import pandas as pd

from training.cleaning import RawDataCleaner, parse_clock_minutes
from training.dataset_config import DatasetConfig


def test_clock_parser_handles_excel_1900_corruption():
    assert parse_clock_minutes("17:20:00") == 1040.0
    assert parse_clock_minutes("01-01-1900 17:20") == 1040.0
    assert parse_clock_minutes("20-01-1900 00:20") == 20.0
    assert parse_clock_minutes("not a time") != parse_clock_minutes("not a time")  # NaN


def test_cleaning_reconciles_every_row():
    frame, report = RawDataCleaner(DatasetConfig()).clean()
    table = report.to_frame()
    assert table.iloc[0]["rows_in"] == len(frame) + int(table["rows_dropped"].sum())
    assert len(frame) > 0


def test_cleaning_fixes_known_data_defects():
    frame, _ = RawDataCleaner(DatasetConfig()).clean()
    assert "destination" in frame.columns          # was the typo 'Destitnation'
    assert "delay_minutes" in frame.columns        # was the typo 'Dealy_min'
    assert set(frame["run_frequency"]) <= {"DAILY", "WEEKLY", "TRI_WEEKLY", "UNKNOWN"}
    for column in ("source", "destination"):
        assert all(value == value.strip() for value in frame[column])
    assert frame["delay_minutes"].isna().sum() == 0


def test_cleaning_is_deterministic():
    first, _ = RawDataCleaner(DatasetConfig()).clean()
    second, _ = RawDataCleaner(DatasetConfig()).clean()
    pd.testing.assert_frame_equal(first, second)


def test_reconciliation_flag_marks_inconsistent_rows():
    frame, _ = RawDataCleaner(DatasetConfig()).clean()
    mismatched = frame[~frame["delay_reconciled"]]
    for _, row in mismatched.iterrows():
        assert row["delay_minutes_stated"] != row["delay_minutes_computed"]
    assert frame["delay_minutes"].equals(frame["delay_minutes_stated"])
