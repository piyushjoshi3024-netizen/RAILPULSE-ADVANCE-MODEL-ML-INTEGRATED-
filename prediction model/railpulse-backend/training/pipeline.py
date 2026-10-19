"""End-to-end training pipeline.

    python3 -m training.pipeline [--data PATH] [--config PATH] [--quick] [--seed N]

Stages: verify -> clean -> profile -> features -> train -> evaluate -> register.
Each stage logs structured progress; the dataset is streamed through parquet
so the same flow scales to far larger files than the bundled sample.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import pandas as pd

from training.cleaning import RawDataCleaner
from training.config import CLEAN_DATA_PATH, RANDOM_SEED
from training.dataset_config import DatasetConfig
from training.download_data import DatasetFetcher
from training.profiling import DatasetProfiler
from training.trainer import DelayModelTrainer

logger = logging.getLogger("training.pipeline")


@dataclass
class PipelineResult:
    """Outcome of one pipeline run."""

    clean_path: str
    rows: int
    pointer: dict[str, Any]
    metadata: dict[str, Any]
    duration_seconds: float

    def summary(self) -> dict[str, Any]:
        metrics = self.metadata.get("metrics", {})
        return {
            "version": self.metadata.get("version"),
            "rows": self.rows,
            "test_mae_minutes": round(metrics.get("test_point_p50", {}).get("mae_minutes", float("nan")), 3),
            "baseline_mae_minutes": round(
                metrics.get("test_baseline_global_mean", {}).get("mae_minutes", float("nan")), 3
            ),
            "beats_baseline": self.metadata.get("beats_baseline"),
            "interval_coverage": round(metrics.get("test_intervals", {}).get("coverage", float("nan")), 3),
            "binary_roc_auc": round(metrics.get("test_binary_classifier", {}).get("roc_auc", float("nan")), 3),
            "model_path": self.pointer.get("model_path"),
            "duration_seconds": round(self.duration_seconds, 1),
        }


class TrainingPipeline:
    """Runs every stage from raw file to registered model."""

    def __init__(
        self,
        config: DatasetConfig | None = None,
        seed: int = RANDOM_SEED,
        quick: bool = False,
        profile: bool = True,
    ) -> None:
        self.config = config or DatasetConfig()
        self.seed = seed
        self.quick = quick
        self.profile = profile

    def run(self) -> PipelineResult:
        """Execute the pipeline and return its result."""
        started = time.time()

        logger.info("stage=verify dataset=%s", self.config.name)
        DatasetFetcher(self.config).ensure()

        logger.info("stage=clean")
        cleaner = RawDataCleaner(self.config)
        frame, report = cleaner.clean()
        clean_path = cleaner.write(frame)
        dropped = int(report.to_frame()["rows_dropped"].sum())
        logger.info("stage=clean rows=%d dropped=%d path=%s", len(frame), dropped, clean_path)

        if self.profile:
            logger.info("stage=profile")
            DatasetProfiler(frame).write_report()

        logger.info("stage=train quick=%s seed=%d", self.quick, self.seed)
        trainer = DelayModelTrainer(self.config, self.seed, self.quick)
        bundle, metadata = trainer.run(frame)

        logger.info("stage=register")
        pointer = trainer.register(bundle, metadata)

        duration = time.time() - started
        logger.info("pipeline complete version=%s seconds=%.1f", metadata.get("version"), duration)
        return PipelineResult(clean_path, len(frame), pointer, metadata, duration)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python3 -m training.pipeline",
        description="Clean, train, evaluate and register the RailPulse delay model.",
    )
    parser.add_argument("--data", default=None, help="path to a raw dataset file (overrides the config)")
    parser.add_argument("--config", default=None, help="path to a dataset config JSON")
    parser.add_argument("--seed", type=int, default=RANDOM_SEED, help="random seed")
    parser.add_argument("--quick", action="store_true", help="reduced search space for a fast run")
    parser.add_argument("--no-profile", action="store_true", help="skip writing the EDA report")
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, arguments.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )
    config = DatasetConfig.load(arguments.config)
    if arguments.data:
        config.raw_path = os.path.abspath(arguments.data)
    result = TrainingPipeline(config, arguments.seed, arguments.quick, not arguments.no_profile).run()
    print(json.dumps(result.summary(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
