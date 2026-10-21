"""Chronological splitting must never leak the future or a trip group."""

import pandas as pd
import pytest

from training.profiling import load_clean
from training.splitter import ChronologicalDateSplitter


def test_split_is_strictly_chronological_and_group_disjoint():
    train, validation, test = ChronologicalDateSplitter().split(load_clean())
    assert train["journey_date"].max() < validation["journey_date"].min()
    assert validation["journey_date"].max() < test["journey_date"].min()
    assert set(train["trip_id"]).isdisjoint(validation["trip_id"])
    assert set(train["trip_id"]).isdisjoint(test["trip_id"])
    assert set(validation["trip_id"]).isdisjoint(test["trip_id"])
    assert min(len(train), len(validation), len(test)) > 0


def test_every_journey_date_lands_in_exactly_one_partition():
    data = load_clean()
    train, validation, test = ChronologicalDateSplitter().split(data)
    days = [set(part["journey_date"].dt.date) for part in (train, validation, test)]
    assert days[0].isdisjoint(days[1]) and days[0].isdisjoint(days[2]) and days[1].isdisjoint(days[2])
    assert len(train) + len(validation) + len(test) == len(data)


def test_leakage_assertion_rejects_non_chronological_partitions():
    data = load_clean()
    splitter = ChronologicalDateSplitter()
    train, validation, test = splitter.split(data)
    with pytest.raises(ValueError):
        splitter.assert_no_leakage(test, validation, train)


def test_expanding_folds_never_train_on_the_future():
    data = load_clean().reset_index(drop=True)
    splitter = ChronologicalDateSplitter()
    for train_idx, valid_idx in splitter.expanding_folds(data, 4):
        assert data.iloc[train_idx]["journey_date"].max() < data.iloc[valid_idx]["journey_date"].min()
        assert set(data.iloc[train_idx]["trip_id"]).isdisjoint(data.iloc[valid_idx]["trip_id"])


def test_split_requires_at_least_three_dates():
    data = load_clean()
    single = data[data["journey_date"] == data["journey_date"].min()]
    with pytest.raises(ValueError):
        ChronologicalDateSplitter().split(single)
