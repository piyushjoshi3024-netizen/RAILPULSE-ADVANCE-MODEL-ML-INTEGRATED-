# Model card — RailPulse delay model (`delay-v3`)

## Intended use

Predicts the **arrival delay in minutes at a train's destination** for a scheduled
journey, and derives an ETA as `scheduled_arrival + predicted_delay`. It is a
prototype built on a very small historical sample. It is suitable for
demonstrating the pipeline and the API contract. **It is not suitable for
operational decisions or passenger-facing guarantees.**

## What it predicts

| Output | Source |
|---|---|
| `delay_p10/p50/p90_minutes` | three LightGBM quantile regressors |
| `predicted_delay_minutes` | the P50 quantile model |
| `predicted_eta`, `eta_lower`, `eta_upper` | scheduled arrival plus P50 / P10 / P90 |
| `p_delay_gt_15` | calibrated classifier (`CalibratedClassifierCV`, sigmoid) |
| `risk_level` | derived from calibrated probabilities, not from a threshold on P50 |
| `delay_category` | the business band containing P50 (see below) |

Fixed thresholds are used **only** to define labels and display bands, never in
place of a model output.

Business band definitions (minutes): `ON_TIME ≤5`, `MINOR ≤15`, `MODERATE ≤60`,
`MAJOR ≤120`, `SEVERE >120`. "Significant delay" means `> 15 min`.

## Training data

| Property | Value |
|---|---|
| File | `data/indian_railway_delay_data_.csv` |
| SHA-256 | `0692778f703919698b009975c429ea0e96c3aad8bb742504d8a1050b6e2fbf69` |
| Rows | **100** |
| Distinct trains | **10** (10 journeys each) |
| Date range | 2016-01-01 → 2025-01-04, **all dates in January** |
| Licence / provenance | **Not documented.** The file ships with the repository with no stated source or licence. Treat its provenance as unknown. |

Cleaning (deterministic, reconciled row by row in
`data/processed/cleaning_reconciliation.csv`): typo columns renamed
(`Destitnation`, `Dealy_min`), whitespace and non-breaking spaces stripped,
`run_frequency` aliases normalised (`Daliy` → `DAILY`), **8 Excel 1900-epoch
corrupted time cells recovered**, and **3 rows flagged** where the stated delay
disagrees with `actual − scheduled` (kept as labelled, never silently rewritten).
100 rows in, 100 rows out, none dropped.

## Features

Used (12): `distance_km`, `scheduled_arrival_hour`, `scheduled_arrival_minute`,
`scheduled_arrival_sin`, `scheduled_arrival_cos`, `day_of_week`, `day_of_month`,
`is_weekend`, `train_number`, `source`, `destination`, `run_frequency`.

Deliberately excluded:

| Column | Reason |
|---|---|
| `season` | constant (`WINTER`) — zero variance |
| `month` | constant (January) — zero variance |
| `year` | the test period lies entirely outside the training year range; a trend term would be pure extrapolation |
| `train_name` | redundant with `train_number` |
| `actual_arrival_minutes`, `delay_minutes_computed` | observed only after arrival — leakage |

The API accepts 13 further fields (`current_delay_minutes`, `track_occupancy`,
`trains_in_section`, …) that the training data has no equivalent for. They are
accepted, **ignored**, and echoed back in `unsupported_fields_ignored` so a
caller can see they had no effect.

## Evaluation

Chronological split on whole journey dates (train 59 / validation 20 / test 21);
no date or trip appears in two partitions. Model family and hyperparameters were
chosen by expanding-window CV on the development window only; the test set was
scored once.

**Held-out test results:**

| Model | MAE (min) | RMSE | median AE | R² |
|---|---|---|---|---|
| Shipped P50 quantile model | 28.72 | 42.99 | 21.69 | −0.146 |
| **baseline: global mean** | **25.46** | 41.13 | 15.37 | −0.049 |
| baseline: per-train mean | 25.92 | 41.11 | 15.00 | −0.048 |
| baseline: global median | 27.52 | 45.56 | 17.00 | −0.287 |

**The shipped model does not beat a constant mean-delay baseline on the held-out
test set** (3.26 min worse MAE). Every R² is negative. This is reported as
`beats_baseline: false` in `/health` and in every prediction response.

| Probabilistic output | Result |
|---|---|
| P10–P90 interval coverage | 0.762 (nominal 0.80), mean width 53.3 min |
| Pinball loss q10 / q50 / q90 | 4.12 / 14.36 / 10.92 |
| `p_delay_gt_15` ROC-AUC | 0.897 |
| `p_delay_gt_15` PR-AUC | 0.98 (test base rate 0.81) |
| `p_delay_gt_15` Brier | 0.193 |

Caveat on the classifier: its F1 of 0.895 is **identical** to always predicting
"delayed", because 81% of test journeys were delayed. The genuine skill is in
*ranking* (ROC-AUC 0.897), not in the F1 number. Calibration drifts under the
test period's distribution shift (mean predicted 0.599 vs observed 0.810).

Permutation importance on test: only `train_number` (+2.00 min MAE) and
`distance_km` (+0.59) carry signal; seven of twelve features score ≤ 0.

## Limitations and failure modes

- **100 rows, 10 trains, one month, one season.** Nothing here generalises.
- The dataset contains **no early arrivals** (no negative delays), so the model
  cannot predict one.
- **Cold start:** an unseen train falls back to route-level/median values and is
  flagged with `train_known_to_model: false`.
- The dataset has **no intermediate station sequence**, so only destination ETA
  is modelled. Delay propagation, operational risk and alert generation keep an
  explicit `future_data_required` envelope.
- Test journeys fall outside the training year range, so measured test error is
  partly distribution shift rather than model error.

## How to retrain on a new dataset

No code changes are required for a new file with different column names. Create
a dataset config and point the pipeline at it:

```bash
cp configs/dataset.default.json configs/dataset.mydata.json
# edit: name, raw_path, column_map, date/clock columns, category aliases,
#       numeric_features, categorical_features, excluded_features
python3 -m training.pipeline --config configs/dataset.mydata.json
```

Or override just the file path:

```bash
python3 -m training.pipeline --data /path/to/bigger_dataset.csv
```

The config controls the raw path and checksum, the raw→canonical column map,
date and clock parsing, value aliases and de-duplication keys, and which derived
features the model uses. Derived features are chosen from the catalogue in
`training/dataset_config.py` (`AVAILABLE_NUMERIC_FEATURES` /
`AVAILABLE_CATEGORICAL_FEATURES`); adding a genuinely new *kind* of derivation —
as opposed to a new column name — is the one case that needs code, in
`app/ml/feature_builder.py`.

The pipeline then re-runs cleaning, profiling, model selection, evaluation and
registration, and writes a new version to `models/registry/` with a refreshed
`models/latest.json`. The API picks it up on restart. Metrics, the dataset hash
and `beats_baseline` in the new `metadata.json` are regenerated from that run —
nothing in this card is carried over.
