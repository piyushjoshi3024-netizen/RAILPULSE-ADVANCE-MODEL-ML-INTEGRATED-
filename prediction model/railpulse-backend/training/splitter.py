from __future__ import annotations

import numpy as np
import pandas as pd


class ChronologicalDateSplitter:
    """Chronological holdout split keyed on whole journey dates.

    Splitting on dates rather than rows keeps every journey of a given date in
    exactly one partition, so a trip can never appear on both sides.
    """

    def __init__(
        self,
        date_column: str = "journey_date",
        group_column: str = "trip_id",
        test_fraction: float = 0.2,
        validation_fraction: float = 0.2,
    ) -> None:
        self.date_column = date_column
        self.group_column = group_column
        self.test_fraction = test_fraction
        self.validation_fraction = validation_fraction

    def split(self, data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Return chronological (train, validation, test) partitions."""
        dates = sorted(pd.to_datetime(data[self.date_column]).dt.date.unique())
        if len(dates) < 3:
            raise ValueError("At least three distinct journey dates are required for splitting")

        test_count = max(1, int(np.ceil(len(dates) * self.test_fraction)))
        validation_count = max(1, int(np.ceil(len(dates) * self.validation_fraction)))
        test_dates = set(dates[-test_count:])
        validation_dates = set(dates[-test_count - validation_count: -test_count])

        day = pd.to_datetime(data[self.date_column]).dt.date
        train = data[~day.isin(test_dates | validation_dates)]
        validation = data[day.isin(validation_dates)]
        test = data[day.isin(test_dates)]
        self.assert_no_leakage(train, validation, test)
        return train, validation, test

    def assert_no_leakage(
        self, train: pd.DataFrame, validation: pd.DataFrame, test: pd.DataFrame
    ) -> None:
        """Raise when partitions overlap in time or share a trip group."""
        if min(len(train), len(validation), len(test)) == 0:
            raise ValueError("Chronological split produced an empty partition")
        groups = [set(part[self.group_column]) for part in (train, validation, test)]
        if groups[0] & groups[1] or groups[0] & groups[2] or groups[1] & groups[2]:
            raise ValueError("Trip groups overlap between partitions")
        train_max = pd.to_datetime(train[self.date_column]).max()
        validation_min = pd.to_datetime(validation[self.date_column]).min()
        validation_max = pd.to_datetime(validation[self.date_column]).max()
        test_min = pd.to_datetime(test[self.date_column]).min()
        if not (train_max < validation_min and validation_max < test_min):
            raise ValueError("Partitions are not strictly chronological")

    def expanding_folds(
        self, data: pd.DataFrame, n_splits: int = 4
    ) -> list[tuple[np.ndarray, np.ndarray]]:
        """Return expanding-window (train_idx, valid_idx) folds over dates.

        Fold *k* trains on every date before a cut point and validates on the
        dates in the next block, so no fold ever trains on the future.
        """
        day = pd.to_datetime(data[self.date_column]).dt.date
        dates = sorted(day.unique())
        if len(dates) < n_splits + 1:
            n_splits = max(1, len(dates) - 1)
        block = max(1, len(dates) // (n_splits + 1))
        positions = np.arange(len(data))
        folds: list[tuple[np.ndarray, np.ndarray]] = []
        for fold in range(1, n_splits + 1):
            cut = block * fold
            valid_dates = set(dates[cut: cut + block])
            if not valid_dates:
                break
            train_mask = day.isin(set(dates[:cut])).to_numpy()
            valid_mask = day.isin(valid_dates).to_numpy()
            if train_mask.sum() == 0 or valid_mask.sum() == 0:
                continue
            folds.append((positions[train_mask], positions[valid_mask]))
        if not folds:
            raise ValueError("Could not build any expanding-window fold")
        return folds
