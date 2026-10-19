"""Negative delays (early arrivals) and the train_type column."""

import pandas as pd
import pytest

from training.cleaning import RawDataCleaner, parse_clock_minutes
from training.dataset_config import DatasetConfig
from training.feature_contract import JourneyFeatureBuilder

RAW_COLUMNS = [
    "Train_id", "Train_name", "Train_no", "Train_type", "Source", "Destitnation",
    "Date", "Distance(Km)", "Sc_arr__time", "Act_arr_time", "Dealy_min",
    "Season", "Run_frequency",
]


def _row(record_id, train_no, train_type, date, sched, actual, delay, season="Winter"):
    return {
        "Train_id": record_id, "Train_name": f"Train {train_no}", "Train_no": train_no,
        "Train_type": train_type, "Source": " Delhi", "Destitnation": "Mumbai ",
        "Date": date, "Distance(Km)": 1200, "Sc_arr__time": sched,
        "Act_arr_time": actual, "Dealy_min": delay, "Season": season,
        "Run_frequency": "Daliy",
    }


@pytest.fixture
def early_arrival_csv(tmp_path):
    """A file with early arrivals, a midnight crossing and five train types."""
    rows = [
        _row("A1", 12301, "Rajdhani",  "04-01-2024 00:00", "10:00:00", "09:55:00", "-00:05:00"),
        _row("A2", 12301, "Rajdhani",  "05-01-2024 00:00", "10:00:00", "08:30:00", "-01:30:00"),
        _row("A3", 12002, "Shatabdi",  "06-01-2024 00:00", "10:00:00", "10:00:00", "00:00:00"),
        _row("A4", 12002, "Shatabdi",  "07-01-2024 00:00", "10:00:00", "10:45:00", "00:45:00"),
        _row("A5", 12621, "Mail",      "08-01-2024 00:00", "23:40:00", "00:20:00", "00:40:00"),
        _row("A6", 12621, "Mail",      "09-01-2024 00:00", "10:00:00", "11:00:00", "01:00:00"),
        _row("A7", 12625, "Superfast", "10-01-2024 00:00", "06:00:00", "05:50:00", "-00:10:00"),
        _row("A8", 12625, "Superfast", "11-01-2024 00:00", "06:00:00", "06:20:00", "00:20:00"),
        _row("A9", 15029, "Express",   "12-01-2024 00:00", "18:00:00", "18:05:00", "00:05:00"),
    ]
    path = tmp_path / "early.csv"
    pd.DataFrame(rows).loc[:, RAW_COLUMNS].to_csv(path, index=False)
    return str(path)


def _config(path: str, **overrides) -> DatasetConfig:
    column_map = dict(DatasetConfig().column_map)
    column_map["Train_type"] = "train_type"
    settings = dict(
        name="early_arrivals", raw_path=path, column_map=column_map,
        allow_negative_delay=True,
        categorical_features=["train_number", "source", "destination", "run_frequency", "train_type"],
    )
    settings.update(overrides)
    return DatasetConfig(**settings)


def test_parser_reads_signed_durations():
    assert parse_clock_minutes("-00:05:00") == -5.0
    assert parse_clock_minutes("-01:30:00") == -90.0
    assert parse_clock_minutes("+00:20:00") == 20.0
    assert parse_clock_minutes("00:20:00") == 20.0


def test_early_arrivals_are_kept_as_negative_delays(early_arrival_csv):
    frame, _ = RawDataCleaner(_config(early_arrival_csv)).clean()
    assert len(frame) == 9
    early = frame[frame["delay_minutes"] < 0]
    assert len(early) == 3
    assert sorted(early["delay_minutes"]) == [-90.0, -10.0, -5.0]


def test_early_arrival_is_not_mistaken_for_a_midnight_crossing(early_arrival_csv):
    """The -5 min row must not become +1435."""
    frame, _ = RawDataCleaner(_config(early_arrival_csv)).clean()
    row = frame[frame["record_id"] == "A1"].iloc[0]
    assert row["delay_minutes"] == -5.0
    assert row["delay_minutes_computed"] == -5.0
    assert row["delay_reconciled"]


def test_genuine_midnight_crossing_still_wraps(early_arrival_csv):
    """23:40 scheduled, 00:20 actual is +40 minutes, not -1400."""
    frame, _ = RawDataCleaner(_config(early_arrival_csv)).clean()
    row = frame[frame["record_id"] == "A5"].iloc[0]
    assert row["delay_minutes_computed"] == 40.0
    assert row["delay_reconciled"]


def test_tolerance_boundary_is_configurable(early_arrival_csv):
    """With a 60-minute tolerance the -90 row is read as a midnight crossing."""
    frame, _ = RawDataCleaner(_config(early_arrival_csv, early_arrival_tolerance_minutes=60)).clean()
    row = frame[frame["record_id"] == "A2"].iloc[0]
    assert row["delay_minutes_computed"] == pytest.approx(1350.0)
    assert not row["delay_reconciled"], "stated -90 should now disagree with the computed value"


def test_negative_delays_are_dropped_when_not_allowed(early_arrival_csv):
    frame, report = RawDataCleaner(_config(early_arrival_csv, allow_negative_delay=False)).clean()
    assert (frame["delay_minutes"] >= 0).all()
    assert len(frame) == 6, "the three early arrivals are dropped"
    assert int(report.to_frame()["rows_dropped"].sum()) == 3


def test_early_arrivals_are_reported_in_the_reconciliation(early_arrival_csv):
    _, report = RawDataCleaner(_config(early_arrival_csv)).clean()
    detail = report.to_frame().set_index("step").loc["build_targets", "detail"]
    assert "3 early arrivals kept as negative delays" in detail


def test_train_type_is_mapped_and_normalised(early_arrival_csv):
    frame, _ = RawDataCleaner(_config(early_arrival_csv)).clean()
    assert "train_type" in frame.columns
    assert set(frame["train_type"]) == {"RAJDHANI", "SHATABDI", "MAIL", "SUPERFAST", "EXPRESS"}


def test_train_type_can_be_used_as_a_feature(early_arrival_csv):
    config = _config(early_arrival_csv)
    frame, _ = RawDataCleaner(config).clean()
    builder = JourneyFeatureBuilder.from_config(config)
    matrix = builder.frame_from_training(frame)
    assert "train_type" in matrix.columns
    assert matrix["train_type"].nunique() == 5


def test_a_dataset_without_train_type_still_cleans():
    """The column is optional: the bundled datasets have no train_type."""
    frame, _ = RawDataCleaner(DatasetConfig()).clean()
    assert "train_type" in frame.columns
    assert frame["train_type"].isna().all()
