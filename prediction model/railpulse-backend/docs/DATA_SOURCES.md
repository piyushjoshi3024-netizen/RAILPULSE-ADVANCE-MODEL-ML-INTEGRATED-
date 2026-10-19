# Data sources

## Original dataset (retained for comparison, not currently trained on)

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

## Synthetic dataset (currently trained on)

**This file is generated, not measured.** Any metric produced from it demonstrates
that the pipeline works end to end. It says nothing about real-world accuracy, and
a model trained on it must never be presented as a production model.

| Field | Value |
|---|---|
| Name | `indian_railway_delay_synthetic_552` |
| Path | `data/indian_railway_delay_synthetic_552.csv` |
| SHA-256 | `dcf3a30e59f8199a1769ba5a186bb26bb9d14a5b6f3cfe08ffc6376b901bdd99` |
| Size | 63,791 bytes |
| Rows | 552 (12 columns) |
| Trains | 12, **46 trips each** |
| Date range | 2023-01-04 → 2026-09-29 (458 distinct dates, **all 12 months**) |
| Seasons | Winter, Summer, Monsoon, Autumn |
| **Provenance** | **SYNTHETIC** — supplied by the project owner, generated from a documented model (fog, monsoon, festival and weekday effects per train). Not observed data. |
| Config | `configs/dataset.synthetic552.json` (`data_provenance: "synthetic"`) |

### Columns

Identical to the original file, including the same typos: `Destitnation`,
`Dealy_min`, and `Daliy` in `Run_frequency`.

### Deliberately reproduced quirks

The generator copied the original file's defects so the cleaner is exercised:

- **8 Excel 1900-epoch cells** (4 in `Sc_arr__time`, 2 in `Act_arr_time`, 2 in `Dealy_min`),
  e.g. `01-01-1900 06:30`, `20-01-1900 01:54`.
- **3 rows** where the stated delay disagrees with `actual − scheduled`
  (trains 12229, 15906, 22832); flagged via `delay_reconciled`, never rewritten.
- **Padded text**: 3 `Source`, 9 `Destitnation`, 6 `Run_frequency` cells carry
  leading/trailing whitespace.
- **`Daliy`** typo throughout `Run_frequency`.

### Observed structure

| Segment | Mean delay (min) |
|---|---|
| Winter | 46.3 |
| Monsoon | 39.1 |
| Autumn | 29.8 |
| Summer | 22.2 |
| January (worst month) | 54.2 |
| May (best month) | 19.2 |
| Per train | 10.7 (12002) → 56.5 (12625) |

Target: mean 35.1 min, median 25.0, max 240, skew 2.22, **no negative delays**
(no early arrivals), 20 exact zeros, P(delay > 15 min) = 0.654.

### Known limits

- **Generated, so the seasonal/monthly/per-train effects are the ones that were
  programmed in.** A model recovering them demonstrates the pipeline learns a
  signal that exists; it does not validate anything about Indian Railways.
- Still no early arrivals, so the model cannot predict one.
- Still no intermediate station sequence, so only destination ETA is modelled.
- 46 trips per train is far below what a production model needs.
- Held-out test is almost entirely 2026, a year absent from training, so `year`
  stays excluded as a feature.

## Supported schema extensions (loaders ready, no dataset yet)

The cleaner and config accept three things the bundled files do not contain.
Each is configuration-driven, so supplying a file that has them needs no code
change. **No model has been retrained on any of these.**

### 1. Early arrivals (negative delays)

Set `allow_negative_delay: true` and the cleaner keeps negative delays instead
of dropping them. `Dealy_min` may be written signed, e.g. `-00:05:00` (five
minutes early); the sign applies to the whole duration.

A negative *actual minus scheduled* difference is ambiguous: the train either
arrived early or crossed midnight. The rule is explicit:

| `allow_negative_delay` | Difference | Read as |
|---|---|---|
| false (default) | any negative | midnight crossing, `+1440` |
| true | negative but within `early_arrival_tolerance_minutes` (default 180) | **early arrival, kept negative** |
| true | more negative than the tolerance | midnight crossing, `+1440` |

So with the default tolerance, `23:40` scheduled and `00:20` actual is `+40`
minutes, while `10:00` scheduled and `09:55` actual is `-5` minutes.

Note: the business bands are unchanged, so a negative delay currently lands in
`ON_TIME`. Adding a distinct `EARLY` band would change the published
`delay_category` values and has not been done.

### 2. `train_type`

Map a type column in `column_map` (e.g. `"Train_type": "train_type"`) and it is
normalised through `category_aliases["train_type"]` to one of **RAJDHANI,
SHATABDI, MAIL, EXPRESS, SUPERFAST**. Add `train_type` to
`categorical_features` to use it. The column is optional: datasets without it
clean exactly as before, with `train_type` left null.

At inference the type comes from the request (`TrainStateRequest.train_type`)
and falls back to `UNKNOWN`, which the encoders already handle as an unseen
category.

### 3. Per-station running history

`training/station_history.py` loads one row per train, date and station:

| Canonical column | Meaning |
|---|---|
| `trip_id`, `train_number`, `journey_date` | trip identity |
| `station`, `station_code`, `station_sequence` | stop identity and order |
| `scheduled_arrival_minutes`, `actual_arrival_minutes` | arrival at the stop |
| `scheduled_departure_minutes`, `actual_departure_minutes` | departure from the stop |
| `arrival_delay_minutes`, `departure_delay_minutes` | derived, midnight-safe, early-arrival aware |
| `scheduled_dwell_minutes`, `actual_dwell_minutes`, `dwell_overrun_minutes` | time standing at the stop |
| `is_origin`, `is_destination` | first and last stop of the trip |

Configure with `station_history_path` and `station_history_column_map`. The
loader orders stops by a supplied `station_sequence`, or derives the order from
the scheduled timeline when that column is absent. It drops stops with no
observed time, empty station names and duplicate stops, and reports every drop
in the same reconciliation table the trip-level cleaner uses.

Usage:

```python
from training.dataset_config import DatasetConfig
from training.station_history import StationHistoryLoader

config = DatasetConfig(station_history_path="data/running_history.csv", allow_negative_delay=True)
loader = StationHistoryLoader(config)
frame, report = loader.load()
print(report.to_frame())
print(loader.stats(frame).as_dict())
loader.write(frame, "data/processed/station_history.parquet")
```

**Not yet wired into the training pipeline.** Intermediate-station ETA and
delay propagation remain `future_data_required` until a real running-history
file exists and a model is trained on it.

## Status of legal sourcing

Phase 1 (sourcing a larger, explicitly licensed Indian Railways delay corpus)
was **skipped at the user's instruction**, and this dataset was used instead.
No external data was downloaded, and no site was scraped.

If a licensed dataset is added later, record here: URL, the licence text
verbatim, required attribution, retrieval date, file names, sizes, SHA-256
checksums, row counts, date ranges and column meanings — then add a dataset
config as described in `docs/MODEL_CARD.md`.
