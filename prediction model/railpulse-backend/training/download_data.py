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
from training.provenance import ProvenanceLedger
from training.registry import file_sha256

logger = logging.getLogger(__name__)


class DatasetFetcher:
    """Ensures the raw dataset is present and matches its expected checksum."""

    def __init__(self, config: DatasetConfig | None = None,
                 ledger: ProvenanceLedger | None = None) -> None:
        self.config = config or DatasetConfig()
        self.ledger = ledger or ProvenanceLedger()

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
        self.assert_provenance_recorded(digest)
        logger.info("dataset verified name=%s path=%s bytes=%d sha256=%s provenance=%s",
                    self.config.name, path, size, digest, self.config.data_provenance)
        return path

    def assert_provenance_recorded(self, digest: str) -> None:
        """Block training on real data that has not cleared the licence gate.

        Synthetic and undocumented datasets are exempt: they are already
        labelled as such everywhere they surface. Real data is not usable until
        its source, licence and checksum are in the provenance ledger.
        """
        if self.config.data_provenance.lower() != "real":
            return
        record = self.ledger.find_by_sha256(digest)
        if record is None:
            raise PermissionError(
                f"Dataset '{self.config.name}' is declared as real data but no provenance "
                f"record exists for sha256 {digest}. Record its source and licence first:\n"
                "  python3 -m training.acquire --name <name> --file <path> "
                "--licence <id> --licence-text-file <file> --attribution <text>"
            )
        if not record.approved:
            raise PermissionError(
                f"Dataset '{self.config.name}' has a provenance record that did not pass the "
                "licence checklist. Resolve the blocking items before training."
            )

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
