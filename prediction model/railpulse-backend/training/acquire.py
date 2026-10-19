"""Acquire a real dataset and clear it through the licence checklist.

    python3 -m training.acquire \
        --name indian_railway_punctuality_2024 \
        --url https://example.gov.in/resource.csv \
        --licence GODL-India \
        --licence-text-file licence.txt \
        --attribution "Ministry of Railways, 2024, <dataset>, data.gov.in" \
        --out data/raw/punctuality_2024.csv

A file you were given rather than downloaded is adopted in place:

    python3 -m training.acquire --name my_data --file /path/to/file.csv \
        --source "supplied:ritik" --licence CC-BY-4.0 --licence-text-file licence.txt \
        --attribution "..."

Nothing is written to the ledger unless every blocking check passes, and
`docs/DATA_SOURCES.md` is updated in the same step - so the record always
exists before any training can run.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
import urllib.request

import pandas as pd

from training.config import BASE_DIR
from training.provenance import (
    APPROVED_LICENCES,
    PROHIBITED_HOSTS,
    LicenceChecklist,
    ProvenanceLedger,
    ProvenanceRecord,
    host_of,
    render_markdown,
    utc_now,
)
from training.registry import file_sha256

logger = logging.getLogger(__name__)

DATA_SOURCES_DOC = os.path.join(BASE_DIR, "docs", "DATA_SOURCES.md")
LEDGER_SECTION = "## Cleared real datasets"
USER_AGENT = "RailPulse-dataset-acquirer/1.0 (+local research use)"


class ProhibitedSourceError(RuntimeError):
    """Raised before any network call when the host is off limits."""


class DatasetAcquirer:
    """Downloads or adopts a dataset, profiles it and runs the licence gate."""

    def __init__(self, ledger: ProvenanceLedger | None = None, timeout: int = 60) -> None:
        self.ledger = ledger or ProvenanceLedger()
        self.timeout = timeout

    def fetch(self, url: str, destination: str) -> str:
        """Download a dataset over HTTPS to `destination`.

        The host is checked before the request is made: a prohibited source is
        never contacted, not merely discarded afterwards.
        """
        self.assert_host_allowed(url)
        os.makedirs(os.path.dirname(destination) or ".", exist_ok=True)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        logger.info("downloading url=%s -> %s", url, destination)
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            if getattr(response, "status", 200) >= 400:
                raise RuntimeError(f"Download failed with status {response.status}")
            with open(destination, "wb") as handle:
                shutil.copyfileobj(response, handle)
        return destination

    @staticmethod
    def assert_host_allowed(url: str) -> None:
        host = host_of(url)
        for prohibited in PROHIBITED_HOSTS:
            if host == prohibited or host.endswith("." + prohibited):
                raise ProhibitedSourceError(
                    f"Refusing to contact '{host}': its terms forbid automated collection. "
                    "Use an official open-data download or a file supplied to you instead."
                )

    @staticmethod
    def adopt(path: str, destination: str | None) -> str:
        """Copy a file you were given into the raw data directory."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"Dataset file not found: {path}")
        if not destination or os.path.abspath(destination) == os.path.abspath(path):
            return os.path.abspath(path)
        os.makedirs(os.path.dirname(destination) or ".", exist_ok=True)
        shutil.copyfile(path, destination)
        return destination

    @staticmethod
    def profile(path: str) -> dict:
        """Read enough of the file to record what it contains."""
        try:
            frame = pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path)
        except Exception as exc:
            logger.warning("could not profile %s: %s", path, exc)
            return {"rows": None, "columns": [], "date_range": None}

        date_range = None
        for column in frame.columns:
            if "date" in str(column).lower():
                parsed = pd.to_datetime(frame[column], errors="coerce", dayfirst=True)
                if parsed.notna().any():
                    date_range = [str(parsed.min().date()), str(parsed.max().date())]
                    break
        return {
            "rows": int(len(frame)),
            "columns": [str(c) for c in frame.columns],
            "date_range": date_range,
        }

    def build_record(self, *, name, source, path, licence, licence_text, attribution,
                     notes="") -> ProvenanceRecord:
        profile = self.profile(path)
        return ProvenanceRecord(
            name=name,
            source_url=source,
            licence=licence,
            licence_text=licence_text,
            attribution=attribution,
            retrieved_at=utc_now(),
            file_name=os.path.relpath(path, BASE_DIR),
            sha256=file_sha256(path),
            bytes=os.path.getsize(path),
            rows=profile["rows"],
            columns=profile["columns"],
            date_range=profile["date_range"],
            notes=notes,
            licence_url=APPROVED_LICENCES.get(licence, ""),
        )

    def clear(self, record: ProvenanceRecord, allow_unlisted_licence: bool = False):
        """Run the checklist and attach its results to the record."""
        checklist = LicenceChecklist(allow_unlisted_licence)
        results = checklist.run(record)
        record.checklist = [
            {"item": r.item, "symbol": r.symbol(), "detail": r.detail, "passed": r.passed}
            for r in results
        ]
        record.approved = LicenceChecklist.passed(results)
        return results

    def register(self, record: ProvenanceRecord) -> tuple[str, str]:
        """Write the cleared record to the ledger and to DATA_SOURCES.md."""
        if not record.approved:
            raise RuntimeError("Refusing to register a dataset that did not pass the checklist")
        ledger_path = self.ledger.add(record)
        doc_path = self.append_to_doc(record)
        return ledger_path, doc_path

    @staticmethod
    def append_to_doc(record: ProvenanceRecord, path: str = DATA_SOURCES_DOC) -> str:
        """Insert or replace this dataset's section in DATA_SOURCES.md."""
        section = render_markdown(record)
        heading = f"### {record.name}"
        existing = open(path).read() if os.path.exists(path) else "# Data sources\n"

        if LEDGER_SECTION not in existing:
            existing = existing.rstrip() + f"\n\n{LEDGER_SECTION}\n\n"

        if heading in existing:
            start = existing.index(heading)
            after = existing.find("\n### ", start + 1)
            end = after if after != -1 else len(existing)
            existing = existing[:start] + section + existing[end:]
        else:
            marker = existing.index(LEDGER_SECTION) + len(LEDGER_SECTION)
            existing = existing[:marker] + "\n\n" + section + existing[marker:].lstrip("\n")

        with open(path, "w") as handle:
            handle.write(existing)
        return path


def read_text_argument(inline: str | None, path: str | None) -> str:
    if path:
        with open(path) as handle:
            return handle.read()
    return inline or ""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python3 -m training.acquire",
        description="Acquire a dataset and clear it through the licence checklist.",
    )
    parser.add_argument("--name", required=True, help="short identifier for the dataset")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="official download URL")
    source.add_argument("--file", help="path to a file you were supplied")
    parser.add_argument("--source", help="origin label for a supplied file, e.g. 'supplied:ritik'")
    parser.add_argument("--out", help="where to store the raw file (default data/raw/<name>.csv)")
    parser.add_argument("--licence", required=True, help="licence identifier, e.g. GODL-India")
    parser.add_argument("--licence-text", help="verbatim licence text")
    parser.add_argument("--licence-text-file", help="file containing the verbatim licence text")
    parser.add_argument("--attribution", required=True, help="attribution statement the licence requires")
    parser.add_argument("--notes", default="", help="anything else worth recording")
    parser.add_argument("--accept-unlisted-licence", action="store_true",
                        help="proceed with a licence not on the known list, having read it yourself")
    parser.add_argument("--dry-run", action="store_true", help="run the checklist without registering")
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, arguments.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )

    acquirer = DatasetAcquirer()
    destination = arguments.out or os.path.join(BASE_DIR, "data", "raw", f"{arguments.name}.csv")

    try:
        if arguments.url:
            path = acquirer.fetch(arguments.url, destination)
            source = arguments.url
        else:
            path = acquirer.adopt(arguments.file, arguments.out)
            source = arguments.source or f"supplied:{os.path.basename(arguments.file)}"
    except ProhibitedSourceError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"Acquisition failed: {exc}", file=sys.stderr)
        return 1

    record = acquirer.build_record(
        name=arguments.name,
        source=source,
        path=path,
        licence=arguments.licence,
        licence_text=read_text_argument(arguments.licence_text, arguments.licence_text_file),
        attribution=arguments.attribution,
        notes=arguments.notes,
    )
    results = acquirer.clear(record, arguments.accept_unlisted_licence)

    print(f"\nLicence checklist for '{record.name}'")
    print("-" * 94)
    for result in results:
        print(f"  [{result.symbol():<5}] {result.item}")
        if result.detail:
            print(f"          {result.detail}")
    print("-" * 94)

    if not record.approved:
        print("\nNOT CLEARED. Fix the BLOCK items above, then re-run. Nothing was recorded.")
        print(f"The file is at {path} but must not be trained on.")
        return 1

    if arguments.dry_run:
        print("\nCLEARED (dry run): nothing was written.")
        return 0

    ledger_path, doc_path = acquirer.register(record)
    print(f"\nCLEARED and recorded."
          f"\n  ledger : {os.path.relpath(ledger_path, BASE_DIR)}"
          f"\n  doc    : {os.path.relpath(doc_path, BASE_DIR)}"
          f"\n  sha256 : {record.sha256}")
    print("\nNext: point a dataset config at the file and run the pipeline:")
    print(f"  python3 -m training.pipeline --data {os.path.relpath(path, BASE_DIR)} --config <your-config>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
