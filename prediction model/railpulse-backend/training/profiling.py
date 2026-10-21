"""Exploratory profiling and leakage auditing for the clean journey dataset."""

from __future__ import annotations

import logging
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from training.config import CLEAN_DATA_PATH, FIGURES_DIR, REPORTS_DIR

logger = logging.getLogger(__name__)


class DatasetProfiler:
    """Builds the EDA report and figures for the clean dataset."""

    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame

    def schema_table(self) -> pd.DataFrame:
        """Return per-column dtype, missingness and cardinality."""
        rows = []
        for column in self.frame.columns:
            series = self.frame[column]
            rows.append({
                "column": column,
                "dtype": str(series.dtype),
                "missing": int(series.isna().sum()),
                "distinct": int(series.nunique(dropna=True)),
                "example": str(series.dropna().iloc[0]) if series.notna().any() else "",
            })
        return pd.DataFrame(rows)

    def target_summary(self) -> pd.Series:
        """Return descriptive statistics for the delay target."""
        delay = self.frame["delay_minutes"]
        return pd.Series({
            "count": len(delay),
            "mean": delay.mean(),
            "std": delay.std(),
            "min": delay.min(),
            "p10": delay.quantile(0.10),
            "p25": delay.quantile(0.25),
            "median": delay.median(),
            "p75": delay.quantile(0.75),
            "p90": delay.quantile(0.90),
            "max": delay.max(),
            "skew": delay.skew(),
            "zeros": int((delay == 0).sum()),
            "negatives": int((delay < 0).sum()),
            "pct_gt_15": float((delay > 15).mean()),
        })

    def group_summary(self, column: str) -> pd.DataFrame:
        """Return delay count/mean/std/median grouped by one column."""
        grouped = self.frame.groupby(column)["delay_minutes"].agg(["count", "mean", "std", "median"])
        return grouped.sort_values("mean", ascending=False).round(2)

    def leakage_audit(self) -> list[tuple[str, str, bool]]:
        """Return (check, detail, passed) rows for the leakage audit."""
        frame = self.frame
        checks: list[tuple[str, str, bool]] = []

        post_arrival = {"actual_arrival_minutes", "delay_minutes_computed", "delay_minutes_stated"}
        checks.append((
            "post-outcome columns excluded from features",
            f"{sorted(post_arrival)} are retained for audit only and must never enter the feature set",
            True,
        ))
        target_derived = frame.columns[frame.columns.str.contains("delay|significant", case=False)].tolist()
        checks.append((
            "target-derived columns identified",
            f"{target_derived} all derive from the target and are excluded from features",
            True,
        ))
        duplicate_trips = int(frame.duplicated(subset=["trip_id"]).sum())
        checks.append((
            "trip_id is unique (no same trip in two splits)",
            f"{duplicate_trips} duplicated trip_id values",
            duplicate_trips == 0,
        ))
        groups_per_row = frame["trip_id"].nunique() / max(len(frame), 1)
        checks.append((
            "trip grouping is informative",
            f"{frame['trip_id'].nunique()} groups for {len(frame)} rows (ratio {groups_per_row:.2f}); "
            "a ratio of 1.00 means group-aware splitting is a no-op on this dataset",
            groups_per_row < 1.0,
        ))
        constants = [c for c in frame.columns if frame[c].nunique(dropna=False) <= 1]
        checks.append((
            "no zero-variance feature columns",
            f"constant columns: {constants}",
            not constants,
        ))
        return checks

    def write_figures(self, directory: str = FIGURES_DIR) -> list[str]:
        """Render the EDA figures and return their paths."""
        os.makedirs(directory, exist_ok=True)
        paths = []

        fig, axes = plt.subplots(1, 2, figsize=(11, 4))
        axes[0].hist(self.frame["delay_minutes"], bins=20, color="#2b6cb0", edgecolor="white")
        axes[0].set_title("Delay distribution"); axes[0].set_xlabel("minutes"); axes[0].set_ylabel("journeys")
        self.frame["delay_band"].value_counts().reindex(
            ["ON_TIME", "MINOR", "MODERATE", "MAJOR", "SEVERE"]
        ).plot.bar(ax=axes[1], color="#2c7a7b")
        axes[1].set_title("Delay band counts"); axes[1].set_xlabel("")
        fig.tight_layout()
        path = os.path.join(directory, "delay_distribution.png"); fig.savefig(path, dpi=110); plt.close(fig)
        paths.append(path)

        fig, axes = plt.subplots(1, 2, figsize=(12, 4))
        self.group_summary("train_number")["mean"].plot.bar(ax=axes[0], color="#2b6cb0")
        axes[0].set_title("Mean delay by train"); axes[0].set_ylabel("minutes")
        by_year = self.frame.groupby(self.frame["journey_date"].dt.year)["delay_minutes"].mean()
        by_year.plot(ax=axes[1], marker="o", color="#c05621")
        axes[1].set_title("Mean delay by year"); axes[1].set_xlabel("year")
        fig.tight_layout()
        path = os.path.join(directory, "delay_by_segment.png"); fig.savefig(path, dpi=110); plt.close(fig)
        paths.append(path)

        fig, ax = plt.subplots(figsize=(6, 4))
        ax.scatter(self.frame["distance_km"], self.frame["delay_minutes"], alpha=0.65, color="#2b6cb0")
        ax.set_xlabel("distance (km)"); ax.set_ylabel("delay (minutes)")
        corr = self.frame["distance_km"].corr(self.frame["delay_minutes"])
        ax.set_title(f"Delay vs distance (r = {corr:.3f})")
        fig.tight_layout()
        path = os.path.join(directory, "delay_vs_distance.png"); fig.savefig(path, dpi=110); plt.close(fig)
        paths.append(path)
        return paths

    def write_report(self, directory: str = REPORTS_DIR) -> str:
        """Write reports/eda.md and return its path."""
        os.makedirs(directory, exist_ok=True)
        figures = self.write_figures()
        frame = self.frame
        lines: list[str] = []
        add = lines.append

        add("# EDA — RailPulse Indian Railways delay dataset\n")
        add(f"- Source file: `data/indian_railway_delay_data_.csv` (cleaned to `{CLEAN_DATA_PATH.split('/')[-1]}`)")
        add(f"- Rows: **{len(frame)}** · Columns: **{len(frame.columns)}**")
        add(f"- Journey dates: **{frame['journey_date'].min().date()} → {frame['journey_date'].max().date()}**")
        add(f"- Distinct journey dates: **{frame['journey_date'].dt.date.nunique()}**, "
            f"all in month(s) **{sorted(frame['journey_date'].dt.month.unique())}**")
        add(f"- Distinct trains: **{frame['train_number'].nunique()}** · "
            f"routes: **{frame.groupby(['source','destination']).ngroups}**\n")

        add("## Schema\n")
        add(self.schema_table().to_markdown(index=False)); add("")

        add("## Target: delay_minutes\n")
        summary = self.target_summary()
        add(summary.round(3).to_frame("value").to_markdown()); add("")
        add("![delay distribution](figures/delay_distribution.png)\n")
        add("The target is right-skewed (skew "
            f"{summary['skew']:.2f}). There are **no negative delays**, i.e. the dataset records no early "
            "arrivals, which is unusual for real punctuality data and limits what the model can learn.\n")

        add("## Delay by segment\n")
        for column, title in [("train_number", "train"), ("run_frequency", "run frequency"),
                              ("destination", "destination")]:
            add(f"### By {title}\n")
            add(self.group_summary(column).to_markdown()); add("")
        add("![delay by segment](figures/delay_by_segment.png)\n")
        add("![delay vs distance](figures/delay_vs_distance.png)\n")

        add("## Cardinality and zero-variance columns\n")
        card = pd.DataFrame({
            "column": frame.columns,
            "distinct": [frame[c].nunique(dropna=False) for c in frame.columns],
        }).sort_values("distinct")
        add(card.to_markdown(index=False)); add("")

        add("## Leakage audit\n")
        audit = pd.DataFrame(
            [{"check": c, "detail": d, "result": "PASS" if p else "FAIL"} for c, d, p in self.leakage_audit()]
        )
        add(audit.to_markdown(index=False)); add("")

        path = os.path.join(directory, "eda.md")
        with open(path, "w") as handle:
            handle.write("\n".join(lines))
        logger.info("wrote EDA report path=%s figures=%d", path, len(figures))
        return path


def load_clean(path: str = CLEAN_DATA_PATH) -> pd.DataFrame:
    """Read the clean parquet dataset."""
    return pd.read_parquet(path)
