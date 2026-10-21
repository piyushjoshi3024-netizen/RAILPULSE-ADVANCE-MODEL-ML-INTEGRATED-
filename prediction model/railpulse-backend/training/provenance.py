"""Licence gate and provenance ledger for real datasets.

Nothing real may be trained on until its origin, licence and checksum are
recorded. The ledger is the machine-readable record; `docs/DATA_SOURCES.md`
is the human-readable rendering of the same facts.

This module never guesses a licence. The operator supplies the verbatim text
from the source; the checklist only decides whether what they supplied is
sufficient and permitted.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from training.config import BASE_DIR

LEDGER_PATH = os.path.join(BASE_DIR, "docs", "provenance_ledger.json")

# Licences that permit training a model and redistributing the result, provided
# their attribution terms are honoured. Identifiers are SPDX where one exists.
APPROVED_LICENCES: dict[str, str] = {
    "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
    "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
    "ODbL-1.0": "https://opendatacommons.org/licenses/odbl/1-0/",
    "ODC-BY-1.0": "https://opendatacommons.org/licenses/by/1-0/",
    "PDDL-1.0": "https://opendatacommons.org/licenses/pddl/1-0/",
    "GODL-India": "https://www.data.gov.in/government-open-data-license-india",
    "OGL-3.0": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    "MIT": "https://opensource.org/license/mit",
    "Apache-2.0": "https://www.apache.org/licenses/LICENSE-2.0",
}

# Licences that forbid this use. Training a model people can use is a
# commercial-capable, derivative use, so NC and ND terms do not qualify.
REJECTED_LICENCES: dict[str, str] = {
    "CC-BY-NC-4.0": "non-commercial clause excludes this use",
    "CC-BY-NC-SA-4.0": "non-commercial clause excludes this use",
    "CC-BY-ND-4.0": "no-derivatives clause excludes model training",
    "CC-BY-NC-ND-4.0": "non-commercial and no-derivatives clauses both exclude this use",
    "proprietary": "no permission to redistribute or build upon the data",
    "unknown": "an undocumented licence is not a permission",
    "none": "absence of a licence is not permission",
}

# Hosts whose terms of service forbid automated collection. Downloading train
# running data from these is out of bounds regardless of technical feasibility.
PROHIBITED_HOSTS: tuple[str, ...] = (
    "ntes.nic.in",
    "enquiry.indianrail.gov.in",
    "indianrail.gov.in",
    "irctc.co.in",
    "railyatri.in",
    "ixigo.com",
    "whereismytrain.in",
    "trainman.in",
    "confirmtkt.com",
    "erail.in",
    "indiarailinfo.com",
    "trainspy.com",
)

MINIMUM_LICENCE_TEXT_CHARS = 200


@dataclass
class CheckResult:
    """One checklist item and whether the submission satisfies it."""

    item: str
    passed: bool
    detail: str = ""
    blocking: bool = True

    def symbol(self) -> str:
        if self.passed:
            return "PASS"
        return "BLOCK" if self.blocking else "WARN"


@dataclass
class ProvenanceRecord:
    """Everything that must be known about a dataset before training on it."""

    name: str
    source_url: str
    licence: str
    licence_text: str
    attribution: str
    retrieved_at: str
    file_name: str
    sha256: str
    bytes: int
    rows: int | None = None
    columns: list[str] = field(default_factory=list)
    date_range: list[str] | None = None
    notes: str = ""
    licence_url: str = ""
    approved: bool = False
    checklist: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "ProvenanceRecord":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in payload.items() if k in known})


class LicenceChecklist:
    """Decides whether a dataset may be used, and says why when it may not."""

    def __init__(self, allow_unlisted_licence: bool = False) -> None:
        self.allow_unlisted_licence = allow_unlisted_licence

    def run(self, record: ProvenanceRecord) -> list[CheckResult]:
        """Return every checklist result, blocking ones first on failure."""
        return [
            self._source_url(record),
            self._prohibited_host(record),
            self._licence_identified(record),
            self._licence_permits_use(record),
            self._licence_text(record),
            self._attribution(record),
            self._checksum(record),
            self._retrieval_date(record),
            self._content_described(record),
        ]

    @staticmethod
    def passed(results: list[CheckResult]) -> bool:
        """True when nothing blocking failed."""
        return all(result.passed or not result.blocking for result in results)

    @staticmethod
    def blockers(results: list[CheckResult]) -> list[CheckResult]:
        return [r for r in results if r.blocking and not r.passed]

    # --- individual checks -------------------------------------------------

    @staticmethod
    def _source_url(record: ProvenanceRecord) -> CheckResult:
        ok = bool(record.source_url) and (
            record.source_url.startswith(("http://", "https://"))
            or record.source_url.startswith("supplied:")
        )
        return CheckResult(
            "Source is recorded (download URL, or 'supplied:<who>' for a file you were given)",
            ok,
            record.source_url or "missing",
        )

    @staticmethod
    def _prohibited_host(record: ProvenanceRecord) -> CheckResult:
        host = host_of(record.source_url)
        hit = next((h for h in PROHIBITED_HOSTS if host == h or host.endswith("." + h)), None)
        return CheckResult(
            "Source is not a site whose terms forbid automated collection",
            hit is None,
            f"host '{host}' is on the prohibited list" if hit else (host or "no host (local file)"),
        )

    def _licence_identified(self, record: ProvenanceRecord) -> CheckResult:
        licence = (record.licence or "").strip()
        if not licence:
            return CheckResult("Licence is identified", False, "missing")
        known = licence in APPROVED_LICENCES or licence in REJECTED_LICENCES
        if known or self.allow_unlisted_licence:
            return CheckResult(
                "Licence is identified",
                True,
                licence if known else f"{licence} (unlisted, accepted by explicit operator override)",
            )
        return CheckResult(
            "Licence is identified",
            False,
            f"'{licence}' is not a known identifier; re-run with --accept-unlisted-licence "
            "after reading the terms yourself",
        )

    @staticmethod
    def _licence_permits_use(record: ProvenanceRecord) -> CheckResult:
        licence = (record.licence or "").strip()
        if licence in REJECTED_LICENCES:
            return CheckResult(
                "Licence permits model training and redistribution",
                False,
                f"{licence}: {REJECTED_LICENCES[licence]}",
            )
        if licence in APPROVED_LICENCES:
            return CheckResult("Licence permits model training and redistribution", True, licence)
        return CheckResult(
            "Licence permits model training and redistribution",
            True,
            f"{licence}: not on either list - the operator asserts it permits this use",
            blocking=False,
        )

    @staticmethod
    def _licence_text(record: ProvenanceRecord) -> CheckResult:
        length = len(record.licence_text or "")
        return CheckResult(
            f"Verbatim licence text is recorded (>= {MINIMUM_LICENCE_TEXT_CHARS} characters)",
            length >= MINIMUM_LICENCE_TEXT_CHARS,
            f"{length} characters recorded",
        )

    @staticmethod
    def _attribution(record: ProvenanceRecord) -> CheckResult:
        return CheckResult(
            "Required attribution statement is recorded",
            bool((record.attribution or "").strip()),
            record.attribution or "missing",
        )

    @staticmethod
    def _checksum(record: ProvenanceRecord) -> CheckResult:
        ok = bool(re.fullmatch(r"[0-9a-f]{64}", record.sha256 or ""))
        return CheckResult("SHA-256 of the downloaded file is recorded", ok, record.sha256 or "missing")

    @staticmethod
    def _retrieval_date(record: ProvenanceRecord) -> CheckResult:
        return CheckResult(
            "Retrieval date is recorded", bool(record.retrieved_at), record.retrieved_at or "missing"
        )

    @staticmethod
    def _content_described(record: ProvenanceRecord) -> CheckResult:
        ok = bool(record.rows) and bool(record.columns)
        return CheckResult(
            "Row count and columns are recorded",
            ok,
            f"{record.rows} rows, {len(record.columns)} columns" if ok else "not profiled",
            blocking=False,
        )


class ProvenanceLedger:
    """The on-disk record of every dataset cleared for use."""

    def __init__(self, path: str = LEDGER_PATH) -> None:
        self.path = path

    def load(self) -> list[ProvenanceRecord]:
        if not os.path.exists(self.path):
            return []
        with open(self.path) as handle:
            return [ProvenanceRecord.from_dict(item) for item in json.load(handle)]

    def save(self, records: list[ProvenanceRecord]) -> str:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w") as handle:
            json.dump([r.to_dict() for r in records], handle, indent=2, sort_keys=True)
        return self.path

    def add(self, record: ProvenanceRecord) -> str:
        """Insert or replace the entry for this checksum."""
        records = [r for r in self.load() if r.sha256 != record.sha256]
        records.append(record)
        return self.save(records)

    def find_by_sha256(self, digest: str) -> ProvenanceRecord | None:
        return next((r for r in self.load() if r.sha256 == digest), None)

    def find_by_name(self, name: str) -> ProvenanceRecord | None:
        return next((r for r in self.load() if r.name == name), None)

    def is_cleared(self, digest: str) -> bool:
        """True when this exact file has passed the checklist."""
        record = self.find_by_sha256(digest)
        return bool(record and record.approved)


def host_of(url: str) -> str:
    """Return the lowercase host of a URL, or '' when there is none."""
    match = re.match(r"^[a-z]+://([^/]+)", (url or "").strip().lower())
    return match.group(1).split("@")[-1].split(":")[0] if match else ""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def render_markdown(record: ProvenanceRecord) -> str:
    """Render one ledger entry as the section recorded in DATA_SOURCES.md."""
    columns = ", ".join(f"`{c}`" for c in record.columns) if record.columns else "not profiled"
    date_range = " → ".join(record.date_range) if record.date_range else "not profiled"
    lines = [
        f"### {record.name}\n",
        "| Field | Value |",
        "|---|---|",
        f"| Source URL | {record.source_url} |",
        f"| Licence | **{record.licence}** |",
        f"| Licence URL | {record.licence_url or '—'} |",
        f"| Retrieved | {record.retrieved_at} |",
        f"| File | `{record.file_name}` |",
        f"| SHA-256 | `{record.sha256}` |",
        f"| Size | {record.bytes:,} bytes |",
        f"| Rows | {record.rows if record.rows is not None else 'not profiled'} |",
        f"| Date range | {date_range} |",
        f"| Checklist | {'**PASSED**' if record.approved else '**NOT CLEARED**'} |",
        "",
        f"**Required attribution:** {record.attribution}\n",
        "**Licence text (verbatim, as recorded by the operator):**\n",
        "```text",
        record.licence_text.strip(),
        "```\n",
        f"**Columns:** {columns}\n",
    ]
    if record.notes:
        lines.append(f"**Notes:** {record.notes}\n")
    lines.append("**Checklist results:**\n")
    lines.append("| Check | Result | Detail |")
    lines.append("|---|---|---|")
    for item in record.checklist:
        lines.append(f"| {item['item']} | {item['symbol']} | {item['detail']} |")
    lines.append("")
    return "\n".join(lines)
