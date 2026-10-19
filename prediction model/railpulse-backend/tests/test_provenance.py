"""The licence gate: nothing real is trainable until its origin is recorded."""

import json
import os

import pandas as pd
import pytest

from training.acquire import DatasetAcquirer, ProhibitedSourceError
from training.dataset_config import DatasetConfig
from training.download_data import DatasetFetcher
from training.provenance import (
    APPROVED_LICENCES,
    MINIMUM_LICENCE_TEXT_CHARS,
    REJECTED_LICENCES,
    LicenceChecklist,
    ProvenanceLedger,
    ProvenanceRecord,
    host_of,
    render_markdown,
)

LICENCE_TEXT = (
    "Government Open Data License - India. The user is granted a worldwide, royalty-free, "
    "non-exclusive licence to use, adapt, publish and distribute the data, provided the user "
    "acknowledges the provider, source and licence of the data by publishing an attribution "
    "statement, and does not suggest that the data provider endorses the user or their use."
)
ATTRIBUTION = "Ministry of Railways, 2024, Train punctuality, data.gov.in, v1.0"


def _record(**overrides) -> ProvenanceRecord:
    payload = dict(
        name="punctuality_2024",
        source_url="https://data.gov.in/resource/example.csv",
        licence="GODL-India",
        licence_text=LICENCE_TEXT,
        attribution=ATTRIBUTION,
        retrieved_at="2026-10-19T12:00:00+00:00",
        file_name="data/raw/punctuality_2024.csv",
        sha256="a" * 64,
        bytes=2048,
        rows=5000,
        columns=["train_no", "date", "delay"],
    )
    payload.update(overrides)
    return ProvenanceRecord(**payload)


@pytest.fixture
def csv_file(tmp_path):
    path = tmp_path / "punctuality.csv"
    pd.DataFrame({
        "Train_no": [12301, 12002, 12301],
        "Date": ["04-01-2024 00:00", "05-01-2024 00:00", "06-01-2024 00:00"],
        "Dealy_min": ["00:10:00", "00:25:00", "00:05:00"],
    }).to_csv(path, index=False)
    return str(path)


@pytest.fixture
def ledger(tmp_path):
    return ProvenanceLedger(str(tmp_path / "ledger.json"))


# --- checklist ---------------------------------------------------------------

def test_a_complete_submission_passes():
    results = LicenceChecklist().run(_record())
    assert LicenceChecklist.passed(results)
    assert LicenceChecklist.blockers(results) == []


def test_every_approved_licence_passes_the_permission_check():
    for licence in APPROVED_LICENCES:
        results = LicenceChecklist().run(_record(licence=licence))
        assert LicenceChecklist.passed(results), f"{licence} should be usable"


def test_non_commercial_and_no_derivatives_licences_are_blocked():
    for licence in REJECTED_LICENCES:
        results = LicenceChecklist().run(_record(licence=licence))
        assert not LicenceChecklist.passed(results), f"{licence} must be refused"


def test_a_prohibited_host_is_blocked():
    for url in (
        "https://ntes.nic.in/export.csv",
        "https://www.railyatri.in/data.csv",
        "https://api.irctc.co.in/x.csv",
    ):
        results = LicenceChecklist().run(_record(source_url=url))
        blockers = [b.item for b in LicenceChecklist.blockers(results)]
        assert any("forbid automated collection" in item for item in blockers), url


def test_missing_licence_text_is_blocked():
    results = LicenceChecklist().run(_record(licence_text="too short"))
    assert not LicenceChecklist.passed(results)
    assert any(str(MINIMUM_LICENCE_TEXT_CHARS) in b.item for b in LicenceChecklist.blockers(results))


def test_missing_attribution_is_blocked():
    assert not LicenceChecklist.passed(LicenceChecklist().run(_record(attribution="  ")))


def test_missing_or_malformed_checksum_is_blocked():
    assert not LicenceChecklist.passed(LicenceChecklist().run(_record(sha256="")))
    assert not LicenceChecklist.passed(LicenceChecklist().run(_record(sha256="not-a-digest")))


def test_an_unlisted_licence_needs_an_explicit_override():
    record = _record(licence="SomeCustomTerms-1.0")
    assert not LicenceChecklist.passed(LicenceChecklist().run(record))
    assert LicenceChecklist(allow_unlisted_licence=True).passed(
        LicenceChecklist(allow_unlisted_licence=True).run(record)
    )


def test_a_supplied_file_is_an_acceptable_source():
    results = LicenceChecklist().run(_record(source_url="supplied:ritik"))
    assert LicenceChecklist.passed(results)


def test_an_unprofiled_file_warns_but_does_not_block():
    results = LicenceChecklist().run(_record(rows=None, columns=[]))
    assert LicenceChecklist.passed(results)
    assert any(r.symbol() == "WARN" for r in results)


def test_host_parsing():
    assert host_of("https://Data.GOV.in/x") == "data.gov.in"
    assert host_of("supplied:someone") == ""


# --- acquirer ----------------------------------------------------------------

def test_prohibited_hosts_are_never_contacted():
    for url in ("https://ntes.nic.in/x.csv", "https://m.railyatri.in/y.csv"):
        with pytest.raises(ProhibitedSourceError, match="forbid automated collection"):
            DatasetAcquirer.assert_host_allowed(url)


def test_an_allowed_host_is_not_refused():
    DatasetAcquirer.assert_host_allowed("https://data.gov.in/resource/x.csv")


def test_adopting_a_supplied_file_profiles_it(csv_file, ledger, tmp_path):
    acquirer = DatasetAcquirer(ledger)
    path = acquirer.adopt(csv_file, str(tmp_path / "raw" / "adopted.csv"))
    record = acquirer.build_record(
        name="supplied_set", source="supplied:ritik", path=path, licence="CC-BY-4.0",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    assert record.rows == 3
    assert record.columns == ["Train_no", "Date", "Dealy_min"]
    assert record.date_range == ["2024-01-04", "2024-01-06"]
    assert len(record.sha256) == 64
    assert record.licence_url == APPROVED_LICENCES["CC-BY-4.0"]


def test_clearing_records_the_checklist_on_the_record(csv_file, ledger):
    acquirer = DatasetAcquirer(ledger)
    record = acquirer.build_record(
        name="s", source="supplied:x", path=csv_file, licence="CC-BY-4.0",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    acquirer.clear(record)
    assert record.approved
    assert len(record.checklist) == 9
    assert all("symbol" in item for item in record.checklist)


def test_a_failed_dataset_is_never_registered(csv_file, ledger):
    acquirer = DatasetAcquirer(ledger)
    record = acquirer.build_record(
        name="bad", source="supplied:x", path=csv_file, licence="CC-BY-NC-4.0",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    acquirer.clear(record)
    assert not record.approved
    with pytest.raises(RuntimeError, match="did not pass the checklist"):
        acquirer.register(record)
    assert ledger.load() == []


def test_registering_writes_the_ledger_and_the_document(csv_file, ledger, tmp_path):
    acquirer = DatasetAcquirer(ledger)
    record = acquirer.build_record(
        name="cleared_set", source="supplied:x", path=csv_file, licence="GODL-India",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    acquirer.clear(record)
    doc = tmp_path / "DATA_SOURCES.md"
    doc.write_text("# Data sources\n\n## Original dataset\n\nstuff\n")
    ledger.add(record)
    DatasetAcquirer.append_to_doc(record, str(doc))

    assert ledger.is_cleared(record.sha256)
    text = doc.read_text()
    assert "## Cleared real datasets" in text
    assert record.sha256 in text
    assert ATTRIBUTION in text
    assert LICENCE_TEXT[:60] in text
    assert "## Original dataset" in text, "existing content must survive"


def test_re_registering_replaces_rather_than_duplicates(csv_file, ledger, tmp_path):
    acquirer = DatasetAcquirer(ledger)
    doc = tmp_path / "DATA_SOURCES.md"
    doc.write_text("# Data sources\n")
    for note in ("first", "second"):
        record = acquirer.build_record(
            name="same_set", source="supplied:x", path=csv_file, licence="CC0-1.0",
            licence_text=LICENCE_TEXT, attribution=ATTRIBUTION, notes=note,
        )
        acquirer.clear(record)
        ledger.add(record)
        DatasetAcquirer.append_to_doc(record, str(doc))
    assert len(ledger.load()) == 1
    assert doc.read_text().count("### same_set") == 1
    assert "second" in doc.read_text()


def test_rendered_markdown_contains_the_required_facts():
    record = _record()
    record.checklist = [{"item": "x", "symbol": "PASS", "detail": "d", "passed": True}]
    markdown = render_markdown(record)
    for required in (record.source_url, record.sha256, record.licence, record.attribution):
        assert required in markdown
    assert LICENCE_TEXT[:50] in markdown


# --- the training gate -------------------------------------------------------

def test_real_data_without_a_ledger_entry_cannot_be_trained_on(csv_file, ledger):
    config = DatasetConfig(name="real_set", raw_path=csv_file, data_provenance="real")
    with pytest.raises(PermissionError, match="no provenance record exists"):
        DatasetFetcher(config, ledger).ensure()


def test_real_data_with_a_failed_record_cannot_be_trained_on(csv_file, ledger):
    acquirer = DatasetAcquirer(ledger)
    record = acquirer.build_record(
        name="real_set", source="supplied:x", path=csv_file, licence="CC-BY-NC-4.0",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    acquirer.clear(record)
    ledger.add(record)  # stored, but not approved
    config = DatasetConfig(name="real_set", raw_path=csv_file, data_provenance="real")
    with pytest.raises(PermissionError, match="did not pass the licence checklist"):
        DatasetFetcher(config, ledger).ensure()


def test_real_data_with_a_cleared_record_is_allowed(csv_file, ledger):
    acquirer = DatasetAcquirer(ledger)
    record = acquirer.build_record(
        name="real_set", source="supplied:x", path=csv_file, licence="GODL-India",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    acquirer.clear(record)
    ledger.add(record)
    config = DatasetConfig(name="real_set", raw_path=csv_file, data_provenance="real")
    assert DatasetFetcher(config, ledger).ensure() == csv_file


def test_the_gate_is_bound_to_the_exact_file(csv_file, ledger, tmp_path):
    """Editing the file after clearance invalidates it."""
    acquirer = DatasetAcquirer(ledger)
    record = acquirer.build_record(
        name="real_set", source="supplied:x", path=csv_file, licence="CC0-1.0",
        licence_text=LICENCE_TEXT, attribution=ATTRIBUTION,
    )
    acquirer.clear(record)
    ledger.add(record)

    with open(csv_file, "a") as handle:
        handle.write("12345,07-01-2024 00:00,00:30:00\n")

    config = DatasetConfig(name="real_set", raw_path=csv_file, data_provenance="real")
    with pytest.raises(PermissionError, match="no provenance record exists"):
        DatasetFetcher(config, ledger).ensure()


def test_synthetic_and_unknown_datasets_are_exempt(csv_file, ledger):
    for provenance in ("synthetic", "unknown"):
        config = DatasetConfig(name="x", raw_path=csv_file, data_provenance=provenance)
        assert DatasetFetcher(config, ledger).ensure() == csv_file


def test_the_bundled_datasets_still_load():
    for path in (None, "configs/dataset.synthetic552.json"):
        config = DatasetConfig.load(path) if path else DatasetConfig()
        assert os.path.exists(DatasetFetcher(config).ensure())
