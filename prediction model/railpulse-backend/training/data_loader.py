from __future__ import annotations

from typing import Any

import pandas as pd

from app.ml.features import feature_frame, parse_datetime, parse_time_minutes


class TrainingDataLoader:
    """Reads the historical CSV and builds the engineered training frame."""

    def __init__(self, filepath: str) -> None:
        self.filepath = filepath

    def load(self) -> pd.DataFrame:
        """Return engineered features joined with targets and split keys."""
        raw = pd.read_csv(self.filepath)
        raw.columns = [column.strip() for column in raw.columns]

        rows: list[dict[str, Any]] = []
        for _, source_row in raw.iterrows():
            event_time = parse_datetime(source_row["Date"])
            distance = float(source_row["Distance(Km)"])
            scheduled_minutes = distance
            delay_minutes = parse_time_minutes(source_row["Dealy_min"])
            feature_row = {
                "event_time": event_time,
                "scheduled_arrival": source_row["Sc_arr__time"],
                "distance_remaining_km": distance,
                "train_number": source_row["Train_no"],
                "train_type": "Express",
                "source": source_row["Source"],
                "destination": source_row["Destitnation"],
                "season": source_row["Season"],
                "run_frequency": source_row["Run_frequency"],
            }
            rows.append(
                {
                    **feature_row,
                    "event_date": event_time,
                    "trip_group": f"{source_row['Train_no']}|{event_time.date().isoformat()}",
                    "target_eta_minutes": scheduled_minutes + delay_minutes,
                    "target_delay_minutes": delay_minutes,
                }
            )

        features = feature_frame(rows)
        targets = pd.DataFrame(
            [
                {
                    "event_date": row["event_date"],
                    "trip_group": row["trip_group"],
                    "target_eta_minutes": row["target_eta_minutes"],
                    "target_delay_minutes": row["target_delay_minutes"],
                }
                for row in rows
            ]
        )
        return pd.concat([features.reset_index(drop=True), targets], axis=1)
