"""The synthetic 552-row dataset loads, cleans and splits through the same pipeline.

These assertions are about the *pipeline*, not about model quality: the file is
generated, so nothing here speaks to real-world accuracy.
"""

import os

import pytest

from training.cleaning import RawDataCleaner
from training.dataset_config import DatasetConfig
from training.feature_contract import JourneyFeatureBuilder
from training.splitter import ChronologicalDateSplitter

CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "configs", "dataset.synthetic552.json",
)

pytestmark = pytest.mark.skipif(
    not os.path.exists(CONFIG_PATH), reason="synthetic dataset config is not present"
)


@pytest.fixture(scope="module")
def config() -> DatasetConfig:
    loaded = DatasetConfig.load(CONFIG_PATH)
    if not os.path.exists(loaded.raw_path):
        pytest.skip(f"synthetic dataset file is not present at {loaded.raw_path}")
    return loaded


@pytest.fixture(scope="module")
def cleaned(config):
    frame, report = RawDataCleaner(config).clean()
    return frame, report


def test_config_declares_synthetic_provenance(config):
    assert config.data_provenance == "synthetic"
    assert config.name == "indian_railway_delay_synthetic_552"
    assert config.allow_negative_delay is False


def test_config_enables_the_now_varying_features(config):
    for feature in ("month", "day_of_year"):
        assert feature in config.numeric_features
    assert "season" in config.categorical_features
    for feature in ("month", "season", "day_of_year"):
        assert feature not in config.excluded_features
    # year stays excluded: the test window is almost entirely a year never trained on
    assert "year" in config.excluded_features


def test_raw_path_resolves_independently_of_the_working_directory(config):
    assert os.path.isabs(config.raw_path)
    assert os.path.exists(config.raw_path)


def test_cleaning_keeps_every_row(cleaned):
    frame, report = cleaned
    table = report.to_frame()
    assert table.iloc[0]["rows_in"] == 552
    assert len(frame) == 552
    assert int(table["rows_dropped"].sum()) == 0


def test_cleaning_recovers_the_excel_1900_cells(cleaned):
    _, report = cleaned
    parse_step = report.to_frame().set_index("step").loc["parse_times"]
    assert parse_step["cells_changed"] == 8


def test_cleaning_flags_the_stated_versus_computed_mismatches(cleaned):
    frame, report = cleaned
    build_step = report.to_frame().set_index("step").loc["build_targets"]
    assert build_step["cells_changed"] == 3
    assert int((~frame["delay_reconciled"]).sum()) == 3
    # the stated delay stays the target; mismatches are flagged, not rewritten
    assert frame["delay_minutes"].equals(frame["delay_minutes_stated"])


def test_cleaning_normalises_the_padded_and_typo_values(cleaned):
    frame, _ = cleaned
    assert set(frame["run_frequency"]) <= {"DAILY", "WEEKLY", "TRI_WEEKLY", "UNKNOWN"}
    assert "DALIY" not in set(frame["run_frequency"])
    for column in ("source", "destination", "season"):
        assert all(value == value.strip() for value in frame[column])


def test_dataset_spans_twelve_trains_all_months_and_four_seasons(cleaned):
    frame, _ = cleaned
    assert frame["train_number"].nunique() == 12
    assert frame["journey_date"].dt.month.nunique() == 12
    assert frame["season"].nunique() == 4
    assert frame.groupby("train_number").size().eq(46).all()


def test_split_is_chronological_with_all_trains_in_every_partition(cleaned):
    frame, _ = cleaned
    train, validation, test = ChronologicalDateSplitter().split(frame)

    assert train["journey_date"].max() < validation["journey_date"].min()
    assert validation["journey_date"].max() < test["journey_date"].min()
    assert len(train) + len(validation) + len(test) == len(frame)

    for partition in (train, validation, test):
        assert partition["train_number"].nunique() == 12, "every train must appear in every partition"

    assert set(train["trip_id"]).isdisjoint(test["trip_id"])
    assert set(validation["trip_id"]).isdisjoint(test["trip_id"])


def test_feature_matrix_follows_the_synthetic_config(config, cleaned):
    frame, _ = cleaned
    builder = JourneyFeatureBuilder.from_config(config)
    matrix = builder.frame_from_training(frame.head(20))
    assert list(matrix.columns) == config.feature_columns
    assert "month" in matrix.columns and "season" in matrix.columns
    assert "year" not in matrix.columns
    assert matrix["month"].nunique() >= 1
