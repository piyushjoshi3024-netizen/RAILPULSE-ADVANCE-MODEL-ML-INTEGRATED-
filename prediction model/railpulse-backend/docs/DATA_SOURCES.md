# Data sources

## Current dataset (in use)

| Field | Value |
|---|---|
| Name | `indian_railway_delay_data_` |
| Path | `data/indian_railway_delay_data_.csv` |
| SHA-256 | `0692778f703919698b009975c429ea0e96c3aad8bb742504d8a1050b6e2fbf69` |
| Size | 11,298 bytes |
| Rows | 100 (12 columns) |
| Date range | 2016-01-01 → 2025-01-04 (22 distinct dates, all in January) |
| Trains | 10 |
| **Licence** | **Unknown — not documented.** The file was already in the repository with no stated origin, licence or attribution. |
| Retrieval date | Unknown (pre-existing in the repository) |

### Columns

| Raw column | Canonical name | Meaning |
|---|---|---|
| `Train_id` | `record_id` | Row identifier |
| `Train_name` | `train_name` | Service name |
| `Train_no` | `train_number` | Train number |
| `Source` | `source` | Origin station |
| `Destitnation` *(typo)* | `destination` | Destination station |
| `Date` | `journey_date` | Journey date (day-first) |
| `Distance(Km)` | `distance_km` | Route distance in km |
| `Sc_arr__time` | `scheduled_arrival_raw` | Scheduled arrival, `HH:MM:SS` |
| `Act_arr_time` | `actual_arrival_raw` | Actual arrival, `HH:MM:SS` |
| `Dealy_min` *(typo)* | `delay_raw` | Delay as an `HH:MM:SS` **duration** |
| `Season` | `season` | Constant `Winter` |
| `Run_frequency` | `run_frequency` | `Daliy` *(typo)* / `Weekly` / `Tri-Weekly` |

### Known data-quality issues

- 8 cells carry Excel 1900-epoch corruption (e.g. `01-01-1900 17:20`); the
  cleaner recovers the time component.
- 3 rows (train 15906) have a stated delay that disagrees with
  `actual − scheduled` by 1–5 minutes; flagged via `delay_reconciled`.
- `Season` and the derived month are constant; `train_type` did not exist and was
  previously hardcoded to `"Express"`.
- No early arrivals: delay is floored at 0 across all 100 rows.
- Leading/trailing spaces and a non-breaking space appear in station and
  frequency values.

## Status of legal sourcing

Phase 1 (sourcing a larger, explicitly licensed Indian Railways delay corpus)
was **skipped at the user's instruction**, and this dataset was used instead.
No external data was downloaded, and no site was scraped.

If a licensed dataset is added later, record here: URL, the licence text
verbatim, required attribution, retrieval date, file names, sizes, SHA-256
checksums, row counts, date ranges and column meanings — then add a dataset
config as described in `docs/MODEL_CARD.md`.
