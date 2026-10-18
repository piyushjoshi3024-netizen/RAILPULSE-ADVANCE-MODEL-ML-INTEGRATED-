from __future__ import annotations

import numpy as np
import pandas as pd


class ChronologicalTripGroupSplitter:
    """Splits the dataset by date so trip groups never cross partitions."""

    def __init__(self, test_fraction: float = 0.2, validation_fraction: float = 0.2) -> None:
        self.test_fraction = test_fraction
        self.validation_fraction = validation_fraction

    def split(
        self, data: pd.DataFrame
    ) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Return the chronological (train, validation, test) partitions."""
        ordered_dates = sorted(data["event_date"].dt.date.unique())
        if len(ordered_dates) < 3:
            raise ValueError("At least three distinct event dates are required for splitting")

        test_date_count = max(1, int(np.ceil(len(ordered_dates) * self.test_fraction)))
        validation_date_count = max(1, int(np.ceil(len(ordered_dates) * self.validation_fraction)))
        test_dates = set(ordered_dates[-test_date_count:])
        validation_dates = set(
            ordered_dates[-test_date_count - validation_date_count : -test_date_count]
        )

        train = data[~data["event_date"].dt.date.isin(test_dates | validation_dates)]
        validation = data[data["event_date"].dt.date.isin(validation_dates)]
        test = data[data["event_date"].dt.date.isin(test_dates)]

        self._validate(train, validation, test)
        return train, validation, test

    @staticmethod
    def _validate(train: pd.DataFrame, validation: pd.DataFrame, test: pd.DataFrame) -> None:
        """Raise when trip groups overlap or a partition is empty."""
        train_groups = set(train["trip_group"])
        validation_groups = set(validation["trip_group"])
        test_groups = set(test["trip_group"])
        if train_groups & validation_groups or train_groups & test_groups or validation_groups & test_groups:
            raise ValueError("Trip groups overlap between train, validation, and test splits")
        if min(len(train), len(validation), len(test)) == 0:
            raise ValueError("Time split produced an empty partition")
