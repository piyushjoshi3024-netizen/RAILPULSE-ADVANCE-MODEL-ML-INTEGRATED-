"""Dataset acquisition and integrity verification.

The bundled dataset ships with the repository, so this module verifies rather
than downloads. A remote source only needs a ``source_url`` in the dataset
config for the same checksum-verified flow to apply.
"""

from __future__ import annotations

import argparse
import logging
import os

from training.dataset_config import DatasetConfig
from training.registry import file_sha256

logger = logging.getLogger(__name__)


class DatasetFetcher:
    """Ensures the raw dataset is present and matches its expected checksum."""

    def __init__(self, config: DatasetConfig | None = None) -> None:
        self.config = config or DatasetConfig()

    def ensure(self) -> str:
        """Return the verified local path to the raw dataset."""
        path = self.config.raw_path
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Raw dataset not found at {path}. Point raw_path in the dataset config "
                "at your file, or place the file at that location."
            )
        digest = file_sha256(path)
        size = os.path.getsize(path)
        if self.config.expected_sha256 and digest != self.config.expected_sha256:
            raise ValueError(
                f"Checksum mismatch for {path}: expected {self.config.expected_sha256}, got {digest}"
            )
        logger.info("dataset verified name=%s path=%s bytes=%d sha256=%s",
                    self.config.name, path, size, digest)
        return path

    def describe(self) -> dict:
        """Return provenance facts recorded in the model metadata."""
        path = self.ensure()
        return {
            "name": self.config.name,
            "path": os.path.relpath(path, os.path.dirname(os.path.dirname(path))),
            "sha256": file_sha256(path),
            "bytes": os.path.getsize(path),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the raw dataset is present and intact.")
    parser.add_argument("--config", default=None, help="path to a dataset config JSON")
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    fetcher = DatasetFetcher(DatasetConfig.load(arguments.config))
    print(fetcher.describe())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
