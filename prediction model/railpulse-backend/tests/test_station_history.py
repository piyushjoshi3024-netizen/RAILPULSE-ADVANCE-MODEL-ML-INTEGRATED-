"""Per-station running-history loader."""

import pandas as pd
import pytest

from training.dataset_config import DatasetConfig
from training.station_history import CANONICAL_COLUMNS, StationHistoryLoader

STOPS = [
    # train, date, seq, station, sch_arr, sch_dep, act_arr, act_dep
    (12301, "04-01-2024 00:00", 1, "Howrah",      "",         "16:50:00", "",         "16:55:00"),
    (12301, "04-01-2024 00:00", 2, "Dhanbad",     "19:35:00", "19:40:00", "19:48:00", "19:56:00"),
    (12301, "04-01-2024 00:00", 3, "Gaya",        "21:30:00", "21:40:00", "21:28:00", "21:45:00"),
    (12301, "04-01-2024 00:00", 4, "Kanpur",      "03:15:00", "03:20:00", "03:50:00", "03:58:00"),
    (12301, "04-01-2024 00:00", 5, "New Delhi",   "10:00:00", "",         "10:35:00", ""),
    (12002, "05-01-2024 00:00", 1, "New Delhi",   "",         "06:00:00", "",         "06:02:00"),
    (12002, "05-01-2024 00:00", 2, "Agra",        "07:55:00", "07:57:00", "07:50:00", "07:59:00"),
    (12002, "05-01-2024 00:00", 3, "Gwalior",     "09:15:00", "09:17:00", "09:20:00", "09:25:00"),
    (12002, "05-01-2024 00:00", 4, "Bhopal",      "13:25:00", "",         "13:21:00", ""),
]

COLUMNS = ["Train_no", "Date", "Seq", "Station", "Sch_arr", "Sch_dep", "Act_arr", "Act_dep"]


@pytest.fixture
def history_csv(tmp_path):
    path = tmp_path / "running_history.csv"
    pd.DataFrame(STOPS, columns=COLUMNS).to_csv(path, index=False)
    return str(path)


def _config(path, **overrides) -> DatasetConfig:
    settings = dict(station_history_path=path, allow_negative_delay=True)
    settings.update(overrides)
    return DatasetConfig(**settings)


def test_loader_requires_a_configured_path():
    with pytest.raises(ValueError, match="No station history configured"):
        StationHistoryLoader(DatasetConfig()).load()


def test_loader_reports_a_missing_file():
    with pytest.raises(FileNotFoundError):
        StationHistoryLoader(DatasetConfig(), path="/does/not/exist.csv").load()


def test_loader_returns_the_canonical_schema(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    assert list(frame.columns) == CANONICAL_COLUMNS
    assert len(frame) == len(STOPS)


def test_every_row_is_accounted_for(history_csv):
    frame, report = StationHistoryLoader(_config(history_csv)).load()
    table = report.to_frame()
    assert table.iloc[0]["rows_in"] == len(STOPS)
    assert len(frame) + int(table["rows_dropped"].sum()) == len(STOPS)


def test_trip_id_groups_stops_by_train_and_date(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    assert frame["trip_id"].nunique() == 2
    assert set(frame["trip_id"]) == {"12301|2024-01-04", "12002|2024-01-05"}
    assert frame.groupby("trip_id").size().to_dict() == {"12301|2024-01-04": 5, "12002|2024-01-05": 4}


def test_origin_and_destination_are_marked(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    for trip_id, stops in frame.groupby("trip_id"):
        assert stops["is_origin"].sum() == 1
        assert stops["is_destination"].sum() == 1
        assert stops.loc[stops["is_origin"] == 1, "station_sequence"].iat[0] == stops["station_sequence"].min()
        assert stops.loc[stops["is_destination"] == 1, "station_sequence"].iat[0] == stops["station_sequence"].max()


def test_arrival_delay_is_computed_per_stop(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    dhanbad = frame[(frame["trip_id"] == "12301|2024-01-04") & (frame["station"] == "Dhanbad")].iloc[0]
    assert dhanbad["arrival_delay_minutes"] == 13.0      # 19:35 -> 19:48
    assert dhanbad["departure_delay_minutes"] == 16.0    # 19:40 -> 19:56


def test_early_arrival_at_an_intermediate_stop_stays_negative(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    gaya = frame[(frame["trip_id"] == "12301|2024-01-04") & (frame["station"] == "Gaya")].iloc[0]
    assert gaya["arrival_delay_minutes"] == -2.0         # 21:30 -> 21:28
    agra = frame[(frame["trip_id"] == "12002|2024-01-05") & (frame["station"] == "Agra")].iloc[0]
    assert agra["arrival_delay_minutes"] == -5.0


def test_overnight_stop_does_not_become_a_huge_delay(history_csv):
    """Kanpur is scheduled 03:15 the next calendar day; the delay is 35 min."""
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    kanpur = frame[(frame["trip_id"] == "12301|2024-01-04") & (frame["station"] == "Kanpur")].iloc[0]
    assert kanpur["arrival_delay_minutes"] == 35.0


def test_dwell_times_are_computed_and_never_negative(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    dhanbad = frame[(frame["trip_id"] == "12301|2024-01-04") & (frame["station"] == "Dhanbad")].iloc[0]
    assert dhanbad["scheduled_dwell_minutes"] == 5.0     # 19:35 -> 19:40
    assert dhanbad["actual_dwell_minutes"] == 8.0        # 19:48 -> 19:56
    assert dhanbad["dwell_overrun_minutes"] == 3.0
    dwell = frame["actual_dwell_minutes"].dropna()
    assert (dwell >= 0).all()


def test_origin_has_no_arrival_and_destination_has_no_departure(history_csv):
    frame, _ = StationHistoryLoader(_config(history_csv)).load()
    origins = frame[frame["is_origin"] == 1]
    destinations = frame[frame["is_destination"] == 1]
    assert origins["actual_arrival_minutes"].isna().all()
    assert destinations["actual_departure_minutes"].isna().all()
    # a stop still counts as observed through whichever time it does have
    assert origins["actual_departure_minutes"].notna().all()
    assert destinations["actual_arrival_minutes"].notna().all()


def test_unusable_and_duplicate_stops_are_dropped(tmp_path):
    rows = list(STOPS) + [
        (12301, "04-01-2024 00:00", 6, "Ghost", "11:00:00", "11:05:00", "", ""),   # no observation
        (12301, "04-01-2024 00:00", 2, "Dhanbad", "19:35:00", "19:40:00", "19:48:00", "19:56:00"),  # dup
        (12301, "04-01-2024 00:00", 7, "", "12:00:00", "12:05:00", "12:10:00", "12:15:00"),  # no station
    ]
    path = tmp_path / "messy.csv"
    pd.DataFrame(rows, columns=COLUMNS).to_csv(path, index=False)
    frame, report = StationHistoryLoader(_config(str(path))).load()
    assert len(frame) == len(STOPS)
    assert int(report.to_frame()["rows_dropped"].sum()) == 3


def test_sequence_falls_back_to_the_scheduled_timeline(tmp_path):
    rows = [(t, d, "", s, sa, sd, aa, ad) for (t, d, _seq, s, sa, sd, aa, ad) in STOPS if s != "Howrah"]
    path = tmp_path / "noseq.csv"
    pd.DataFrame(rows, columns=COLUMNS).to_csv(path, index=False)
    frame, report = StationHistoryLoader(_config(str(path))).load()
    assert frame["station_sequence"].notna().all()
    detail = report.to_frame().set_index("step").loc["sequence_stops", "detail"]
    assert "derived from the scheduled timeline" in detail


def test_stats_summarise_the_history(history_csv):
    loader = StationHistoryLoader(_config(history_csv))
    frame, _ = loader.load()
    stats = loader.stats(frame).as_dict()
    assert stats["rows"] == 9 and stats["trips"] == 2 and stats["trains"] == 2
    assert stats["stations"] == 8
    assert stats["early_arrivals"] == 3   # Gaya -2, Agra -5, Bhopal -4
    assert stats["stops_per_trip"]["min"] == 4 and stats["stops_per_trip"]["max"] == 5
    assert stats["date_range"] == ("2024-01-04", "2024-01-05")


def test_column_names_come_from_the_config(tmp_path):
    """A differently-named file loads by configuration, not code."""
    renamed = pd.DataFrame(STOPS, columns=COLUMNS).rename(columns={
        "Train_no": "train", "Date": "run_date", "Station": "stn",
        "Sch_arr": "sa", "Sch_dep": "sd", "Act_arr": "aa", "Act_dep": "ad", "Seq": "order",
    })
    path = tmp_path / "custom.csv"
    renamed.to_csv(path, index=False)
    config = _config(str(path), station_history_column_map={
        "train": "train_number", "run_date": "journey_date", "stn": "station",
        "order": "station_sequence", "sa": "scheduled_arrival_raw", "sd": "scheduled_departure_raw",
        "aa": "actual_arrival_raw", "ad": "actual_departure_raw",
    })
    frame, _ = StationHistoryLoader(config).load()
    assert len(frame) == len(STOPS)
    assert frame["trip_id"].nunique() == 2


def test_missing_required_column_names_the_fix(tmp_path):
    path = tmp_path / "bad.csv"
    pd.DataFrame(STOPS, columns=COLUMNS).drop(columns=["Station"]).to_csv(path, index=False)
    with pytest.raises(ValueError, match="station_history_column_map"):
        StationHistoryLoader(_config(str(path))).load()


def test_writes_parquet(history_csv, tmp_path):
    loader = StationHistoryLoader(_config(history_csv))
    frame, _ = loader.load()
    out = loader.write(frame, str(tmp_path / "processed" / "station_history.parquet"))
    assert pd.read_parquet(out).shape == frame.shape
