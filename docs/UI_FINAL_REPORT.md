# RailPulse ML dashboards — final report

Branch `feature/ml-dashboards`, five commits from `feature/real-data-ml` @ `381fa84`.
Everything below was run; where something was not run, it says so.

---

## Files inspected and changed

### Inspected, not changed

`frontend/frontend/src/**` (React main site, 24 files), `backend/src/**` (Node/Express, 13 route
files), `prediction model/railpulse-backend/app/**` (FastAPI, 39 modules),
`training/**` (19 modules), `tests/**` (16 suites), both `package.json` files,
`configs/dataset.synthetic552.json`, `data/indian_railway_delay_synthetic_552.csv`,
`reports/model_comparison.md`, `reports/eda.md`, `docs/MODEL_CARD.md`, `docs/DATA_SOURCES.md`.

### Changed

| File | Change |
|---|---|
| `prediction model/railpulse-frontend/js/format.js` | **new** — timezone policy, formatting, staleness, count-up |
| `…/js/chart-core.js` | **new** — DOM-free chart geometry |
| `…/js/charts.js` | **new** — SVG chart rendering |
| `…/js/ui.js` | **new** — honest states, badges, verdicts, source footers |
| `…/js/pages/passenger.js` | **new** — PASSENGER portal |
| `…/js/pages/staff.js` | **new** — STAFF portal |
| `…/js/pages/operations.js` | **new** — scenario comparison, network intelligence |
| `…/js/pages/admin.js` | **new** — ADMIN model and evaluation surface |
| `…/tests/{chart-core,format,ui,operations}.test.js` | **new** — 174 assertions |
| `…/package.json` | **new** — `npm test`, no dependencies |
| `…/js/app.js` | +~80 lines: role dispatch, three actions, filter listener, `goToTrain`, demo-panel mount |
| `…/css/style.css` | 1507 → 2499 lines, **append-only** (original bytes verified unchanged) |
| `prediction model/railpulse-backend/training/trainer.py` | +108: one additive export method and its call |
| `…/app/api/routes/model.py` | **new** — ADMIN-only evaluation route |
| `…/app/main.py` | +4: one router, one tag |
| `…/.gitignore` | +6: `reports/evaluation.json` |
| `…/tests/test_model_evaluation.py` | **new** — 9 tests |
| `…/scripts/ui_smoke.py` | extended with `--sweep`; the single-role path repaired |
| `…/scripts/state_checks.py` | **new** — honest-state checks |

**Not touched:** Node auth/OTP, Mongoose models, Redis, Socket.IO, the dataset CSVs, every existing
test (only extended), and — per gate D4 — the React main site, which is **unchanged**.

---

## Per-role improvements

**PASSENGER** — answers one question: when will my train arrive and how sure is that. Scheduled,
predicted and remaining time side by side; the lateness and the P10–P90 window in words
("Most likely between 06:01 IST and 06:26 IST"); risk phrased as "about 44 in 100 journeys that look
like this one"; an interval chart with the schedule as its zero; measured coverage with its shortfall
stated; a route where every node says where its information came from, under a plain
**"No part of this route is GPS-tracked"**; and prediction history captioned as past estimates. No
metrics, feature lists or model internals — verified by assertion.

**STAFF** — what needs attention first: degraded and stale banners, four KPI tiles, the alerts
*Not available* panel, then the band distribution and per-train predicted delay, then the
scheduled-against-predicted table with filters and interval indicators, then one train in detail.
Nothing predicts on page load. A scenario comparison varies only the lever that actually moves the
model, discloses that it writes, and restores state afterwards.

**ADMIN** — staff plus the model surface, organised around a hard separation between **Live** and
**Historical evaluation** with different grounds, borders and heading badges, because a measured MAE
beside live counters reads as live accuracy and is not.

---

## Charts: component → source → field

Every one of the 14 chart call sites carries a `source` line on screen. Verified by sweep: 33 chart
instances rendered, **0 missing an `aria-label`, 0 missing a source footer**.

| Chart (mount) | Role | Endpoint / file | Fields read |
|---|---|---|---|
| Predicted delay range (`#arrival-interval-chart`) | passenger | `POST /api/v1/predict/eta` | `predicted_delay_minutes`, `delay_p10_minutes`, `delay_p90_minutes` |
| Prediction history (`#history-sparkline`) | passenger | `GET /trains/{n}/predictions` | `predicted_delay_minutes`, `delay_p10_minutes`, `delay_p90_minutes`, `timestamp` |
| Predicted delay band (`#band-chart`) | staff | `GET /trains/{n}/predictions` | `delay_category` |
| Latest predicted delay by train (`#fleet-delay-chart`) | staff | `GET /trains/{n}/predictions` | `predicted_delay_minutes` (newest row per train) |
| Delay across successive runs (`#fleet-trend`) | staff | `GET /trains/{n}/predictions` | `predicted_delay_minutes`, `delay_p10_minutes`, `delay_p90_minutes`, `timestamp` |
| Per-train trend (`#detail-trend`) | staff | `GET /trains/{n}/predictions` | same as above, one train |
| Predicted delay by scenario (`#scenario-chart`) | staff | `POST /api/v1/predict/eta` | `predicted_delay_minutes` per scenario run |
| MAE on held-out split (`#baseline-chart`) | admin | `GET /health/` | `metrics.test_point_p50.mae_minutes`, `metrics.test_point_selected_regressor.mae_minutes`, `metrics.test_baseline_global_mean.mae_minutes` |
| Interval coverage (`#coverage-chart`) | admin | `GET /health/` | `metrics.test_intervals.coverage`, `.nominal_coverage` |
| Error and bias by train (`#segment-chart`) | admin | `GET /health/` | `metrics.test_error_by_segment.train_number[].mae_minutes`, `.bias_minutes` |
| Probability calibration (`#calibration-chart`) | admin | `GET /health/` | `metrics.test_binary_calibration[].mean_predicted`, `.observed_rate`, `.count` |
| Predicted against actual (`#scatter-chart`) | admin | `GET /api/v1/model/evaluation` | `test_rows[].actual_delay_minutes`, `.p50`, `.train_number`, `.journey_date` |
| Residual distribution (`#residual-chart`) | admin | `GET /api/v1/model/evaluation` | `test_rows[].residual_minutes` |
| Absolute error by journey date (`#historical-trend`) | admin | `GET /api/v1/model/evaluation` | `test_rows[].residual_minutes`, `.journey_date` |

No chart reads a value through `Number()`; every numeric field goes through `finite()`.

---

## Blocked features, and the exact missing input

| Feature | Why it cannot be shown | What would unblock it |
|---|---|---|
| Actual arrival on a live journey | The system never records when a train actually arrived | An actual-arrival feed |
| Station-level analytics | Dataset holds origin and destination only; `route.stops_available: false` | Intermediate station sequences |
| Intermediate station ETAs | Same; `/trains/{n}/upcoming-stations` returns the destination only | Route schedules |
| Operational alerts | `/alerts` returns `future_data_required` and an empty list, for every role | A live event/alert-rules feed |
| Delay propagation, operational risk | `/network/...` return typed empty envelopes | Station sequence + live network feed |
| Feature importance | The trainer exports none | Permutation importance on the held-out split |
| Fallback / failed-request counts | No counters exist; FastAPI has no fallback path (503, never a rule-based substitute) | A metrics endpoint |
| Rule-based scenario comparison | The rule engine is in the Node service, unreachable from this portal | A Node endpoint, or running it on the main site |
| Live model accuracy | Nothing scores a prediction after the fact | Actual arrivals plus a scoring job |

Each appears on screen as an explicit *Not available* card with its reason — never as an empty chart,
a zero, or a disabled control.

---

## Animation and accessibility

- Reveal is a ≤400 ms clipped rect, skipped in JS under `prefers-reduced-motion` **and** neutralised
  by the pre-existing global CSS block. Swept all 17 routes under emulation: **0 animated elements**.
- `countUp` writes the real number synchronously *before* deciding to animate, and animates only on
  first paint or a genuine value change, so an unchanged poll animates nothing.
- Colour is never the only encoding: every series carries a dash pattern and a marker shape, asserted
  unique by unit test. `SEVERE` carries an extra rule so it is distinct from `MAJOR`; stale rows use a
  rule and an age chip.
- Contrast measured, not assumed. Marks treated as graphics (3:1), text as text (4.5:1). Two real
  failures were found and fixed: legend chips moved to `--paper` (green was 4.48 on `--sand`), and the
  toggled-off state moved to full `--ink`.
- Every chart has an `aria-label` summary built from the drawn data, and a "View as table" panel.
- The plot takes one tab stop; arrow keys, Home, End and Escape move a read-out announced through a
  polite live region — keyboard tooltips without thousands of focusable nodes.
- Tab order reaches 11–12 stops on every page at every viewport.
- 360 px: no horizontal scroll anywhere; the wide fleet table scrolls inside its own region, which is
  focusable and labelled.

---

## Commands run, with real results

| Command | Result |
|---|---|
| `cd frontend/frontend && npm ci` | **passed** |
| `cd frontend/frontend && npm run build` | **passed**, 556 ms |
| `cd frontend/frontend && npm run lint` | **failed — 13 problems (11 errors, 2 warnings)**, byte-identical to the Phase 0 baseline. Pre-existing |
| `cd backend && npm ci && npm test` | **passed** 14/14 |
| `pytest -q` | **passed 149** (140 baseline + 9 new) |
| `cd "prediction model/railpulse-frontend" && npm test` | **passed 174**, 37 suites |
| `python3 -m training.pipeline --config configs/dataset.synthetic552.json` | **passed**; metrics sha256 `5b3b842f…a57d`, identical to pre-change |
| `python3 scripts/ui_smoke.py --role admin` | **passed**, all 13 checks |
| `python3 scripts/ui_smoke.py --role staff` | **passed**, all 13 checks |
| `python3 scripts/ui_smoke.py --sweep` | **passed** — 51 pages, 0 console errors, 0 page errors, 0 overflow, 33 charts, 0 missing aria, 0 missing source |
| `python3 scripts/state_checks.py` (model loaded) | **passed**, 1 skipped |
| `python3 scripts/state_checks.py` (model removed) | **passed**, 1 skipped |
| OpenAPI before/after diff | **passed** — one path, one tag, nothing else |

**Not run:** any deployment, any load or performance benchmark beyond the 5,000-point render test,
any cross-browser check (Chromium only), and any test against real railway data — none exists.

### State tests

| State | How it was produced | Result |
|---|---|---|
| Degraded model | `models/` moved aside, service restarted | `/health` degraded; admin page states it and names the fix command; passenger journey degrades to timetable-only |
| Fallback source | — | **Not applicable on this surface and recorded as such.** FastAPI has no fallback path; it returns 503. The rule-based fallback is in the Node service |
| Stale data | Demo states older than the threshold | Banner states the age and the timestamp. *Skipped in the automated run* because the first card was freshly seeded; verified manually in Phase 2 ("21 days ago") |
| Empty history | Freshly registered passenger | Empty state, not a blank page or a zero |
| API timeout | Frontend pointed at a dead port | "could not be reached" stated, not a blank shell |
| 401 | Anonymous calls | 401 on every guarded route |
| 403 | PASSENGER and STAFF on admin routes | 403, including a browser fetch with a real passenger token |
| Role isolation | Full matrix, 6 routes × 4 callers | Matches expectations exactly |

Destructive endpoints (`/demo/reset`, `/reference/load`) are proved by **who is refused**; the
authorised call is deliberately not made, because firing it would wipe the data the other checks run
against. This was learned the hard way — an earlier run did fire it and corrupted its own fixture.

---

## Backend changes, and why

Only gate D3, which was approved by default and whose scope was fixed in advance.

1. **`training/trainer.py`** — one additive method writing `reports/evaluation.json` after the
   evaluation has already run. It reads only arrays that evaluation produced; nothing is fitted,
   scored or re-ordered. Failure is logged and swallowed so reporting cannot cost a training run.
   *Why:* without per-row held-out predictions, the predicted-against-actual scatter and the residual
   histogram cannot be drawn honestly, and approximating them from aggregates would be invention.
2. **`app/api/routes/model.py` + one line in `app/main.py`** — read-only, ADMIN-only, 404 when absent.
3. **`.gitignore`** — one literal path, reviewed before application.

**Proofs:** training metrics byte-identical to the pre-change baseline (`5b3b842f…a57d`), confirmed
again after the final Phase 5 run; OpenAPI additive only; coverage recomputed from the 111 exported
rows reproduces the published aggregate to ten decimals.

---

## Observations (not fixed)

1. **Unauthenticated Node routes.** Every `backend/src/routes/*.js` except `auth.routes.js` and
   `eta.routes.js` has no `authenticate`/`authorize`: trains CRUD, alerts, operations, simulation,
   network, journey, propagation, risk, bottleneck, train-events. **The React role gating on
   `/operations` and `/simulation` is cosmetic, not security.** Nothing in this work describes it as
   security, and no restricted data was placed behind it.
2. **`GET /api/v1/health/` is public and returns the complete `metrics` dict** — per-train held-out
   error and bias, classifier calibration, both baselines. Model evaluation detail is therefore
   already world-readable on a running instance, which partly undercuts making `/model/evaluation`
   ADMIN-only. Out of scope under rule 9.
3. **`POST /predict/eta` mutates shared state.** It writes a history row *and* upserts the live state,
   so a caller cannot ask for a prediction without rewriting stored data. The scenario tool works
   around this with a restore; a read-only prediction mode would be the real fix.
4. **Default credentials are hardcoded** at `scripts/ui_smoke.py:25` (pre-existing). The script now
   prefers environment variables and falls back to those defaults; the literals were left in place.
5. **`reports/model_comparison.md` is tracked and stale** (59/20/21 split) and nothing in
   `training.pipeline` regenerates it. Anyone reading it gets wrong numbers.
6. **`scrollToUpdate()` in `app.js`** uses `behavior: 'smooth'` unconditionally, ignoring
   `prefers-reduced-motion`. Pre-existing; my own scroll helper honours the preference.
7. **Source-data defects are served verbatim** — `run_frequency: "Daliy"`, trailing space in
   `"RANI KAMLAPATI "`. Display trims whitespace only; nothing is silently corrected.
8. **Dev-database residue**: trains numbered `string` and `FRONTEND-TEST-123` with
   `data_source: CSV_LIVE`, which no code in this repo writes. The UI handles them without breaking.
9. **1 high-severity npm audit finding** in `frontend/frontend` (pre-existing, untouched).

---

## Remaining limitations

- **The model is a prototype trained on 552 rows of synthetic data.** It beats its mean-delay
  baseline by 2.9 minutes of MAE, and its R² is 0.075. The scatter shows predictions clustering in a
  5–50 minute band while actuals span 0–180. Every surface says so.
- **Intervals under-cover**: 70.3% measured against 80% nominal. Stated wherever an interval appears.
- **Nothing is ever scored against reality.** No arrival is recorded, so no figure anywhere is live
  accuracy, and the admin page separates Live from Historical to keep that clear.
- **Times are an assumption.** The dataset records no timezone; reading its wall-clock times as
  Indian local is stated on screen as an assumption, not a fact.
- **Chromium only.** No Firefox or WebKit run.
- **51 sweep screenshots (3.7 MB) are written to `reports/figures/ui/` but left untracked** — see the
  note at the end of `UI_PROGRESS.md`; committing them needs your decision on a second `.gitignore`
  line.
- The staff fleet view loads one request per train. At 16 trains that is fine; at several hundred it
  would need a batched endpoint, which does not exist.
