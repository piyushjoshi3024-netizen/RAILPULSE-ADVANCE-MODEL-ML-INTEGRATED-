# RailPulse ML dashboards — UI progress log

Resume point for a fresh session. One phase per message; do not start the next phase unprompted.

- Branch: `feature/ml-dashboards` (created from `feature/real-data-ml` @ `381fa84`)
- Scratch dir (not committed): `/tmp/claude-1000/-home-ritik-Desktop-RAILPULSE-ADVANCE-MODEL-ML-INTEGRATED-/0e8d691c-1dc1-45d6-9435-d07e942d7053/scratchpad`
  - `metrics_before.json`, `metadata_run1.json`, `metadata_run2.json`, `fixtures/*.json` (real API responses), `openapi_before.json`
- Last updated: 2026-10-20 — end of Phase 5 (final)

---

## Status

| Phase | State |
|---|---|
| 0 Inspect, baseline, plan | Done (commit `9af23ee`) |
| 1 Foundations | Done (commit `4b1395d`) |
| 2 Passenger | Done (commit `9bcd472`) |
| 3 Staff | Done (commit `09872d7`) |
| 4 Admin + D3 | Done (commit `541c55e`) |
| 5 Verification + report | **Done (this commit)** — see `docs/UI_FINAL_REPORT.md` |

---

## Phase 0 — what was verified

### Section 0 confirmed

- Two frontends, as described: `frontend/frontend` (React 19 / Vite / Tailwind 4) and
  `prediction model/railpulse-frontend` (vanilla ES modules, hash router, one 1,506-line CSS file, no build step).
- No chart library, no animation library in either frontend. Confirmed from both `package.json` files
  and the absence of any `<script src>` beyond the Google Fonts stylesheet in `index.html`.
- Roles are `PASSENGER` / `STAFF` / `ADMIN`. ML app portals are `#/passenger/*`, `#/staff/*`, `#/admin/*`.
- ML app pages exist per role: dashboard, train, history, alerts, simulation, capabilities, system (ADMIN).
- React main site has `pages/ETAPrediction.jsx` (920 lines) already using `predictionSource` (line 565)
  and `fallbackReason` (line 624). Extend, do not rebuild.
- Node routes other than `/api/auth/*` and `/api/trains/:id/eta` have no `authenticate`/`authorize`.
  Verified by grep: only `auth.routes.js` and `eta.routes.js` reference the middleware.
- Dataset: `indian_railway_delay_synthetic_552.csv`, 552 rows, 12 trains, 2023-01-04 → 2026-09-26,
  `data_provenance: synthetic`. The only dataset in use.
- `reports/model_comparison.md` is stale (`{'train': 59, 'validation': 20, 'test': 21}`). It is written by
  `training/experiments.py`, **not** by `training.pipeline`, so two pipeline runs left it untouched.
  Never read evaluation numbers from it.
- ML app CSS has `@keyframes rise/slide-in/spin` (lines 1332/1344/1356) and a
  `@media (prefers-reduced-motion:reduce)` block (line 1497).

### Section 0 corrections — things that differ from the prompt

1. **A trained model artifact DOES exist locally.** `models/latest.json` +
   `models/registry/delay-v3-*/model.joblib`. `models/` is gitignored (`.gitignore:53`), so it is
   untracked but present on this machine. `/health` reports `status: ok`, not `degraded`.
   The degraded path must therefore be tested by temporarily moving `models/` aside, not by default.
2. **`/api/v1/health/` is unauthenticated and already returns the full `metrics` dict.**
   `app/api/routes/health.py:53` returns `metadata["metrics"]` verbatim, which includes
   `test_error_by_segment.train_number` (per-train MAE + bias, 12 entries),
   `test_error_by_segment.run_frequency`, `test_intervals` (coverage, mean width, pinball),
   `test_binary_calibration`, `test_binary_classifier` and both baselines.
   So charts 5 (selected vs global-mean baseline), 8 (per-train/segment error) and the calibration
   curve are available **without D3**. Only per-row residuals and the candidate CV table are not.
   Note this is also a security observation — see below.
3. **The trainer metadata already contains the full candidate comparison table.**
   `metadata.selection.cv_table` has 15 rows (model × encoder × cv_mae × std × best_params).
   It is **not** in `metrics`, so it is **not** on `/health` today.
4. **`scripts/ui_smoke.py` already exists** at `prediction model/railpulse-backend/scripts/ui_smoke.py`
   (140 lines, Playwright, drives the ML app). Phase 5 extends it. There is no repo-root `scripts/`.
   Playwright + Chromium 156.0.8078.4 are installed and working in the venv.
5. **`/api/v1/alerts` can never return rows.** It returns
   `{"status": "future_data_required", "alerts": [], "limitation": "..."}` for every role.
   Phase 3's "alerts first" must be an honest *Not available* panel driven by `limitation`, not a chart.
6. **`/trains/{n}/upcoming-stations` returns exactly one stop** (the destination) once the reference
   catalogue is loaded, with `limitation: "Only the destination arrival is modelled: the dataset contains
   no intermediate station sequence..."`. Before `POST /reference/load` (ADMIN) it returns
   `status: future_data_required` and an empty list. The Phase 2 "route timeline" is therefore
   origin → destination, two nodes, no en-route stops.
7. **`/reference/trains?q=` returns real observed delay statistics from the dataset**:
   `observed_delay_mean_minutes`, `observed_delay_median_minutes`, `observed_journeys`,
   `first_seen`, `last_seen`, `scheduled_arrival_minutes`, `distance_km`, `run_frequency`.
   This is an honest historical/observed source available to any authenticated role, **no D3 needed** —
   but it is computed over the *whole* dataset (train+val+test), so it is a dataset summary,
   not a held-out model evaluation, and must be labelled that way.
8. **Timezone reality contradicts rule 20.** See the open question below.
9. `app.js` is 251 lines but 43 KB — most functions are single very long lines. Editing needs care;
   it is not a conventionally formatted file.
10. Live/demo data is dirty by design: `destination: "RANI KAMLAPATI "` (trailing space),
    `run_frequency: "Daliy"` (typo in the source CSV), `current_station: "In-transit"`,
    `current_section: "Unknown"`. Labels must be trimmed for display but never silently corrected.
11. Demo train timestamps are `2026-09-28`, i.e. ~22 days before today (2026-10-20). The *stale*
    state is the default state, not an edge case.

### Baseline commands and real results

| Command | Result |
|---|---|
| `cd frontend/frontend && npm ci` | **pass** (192 packages, 1 high-severity audit finding, pre-existing) |
| `cd frontend/frontend && npm run build` | **pass** — `dist/assets/index-Cp8_H3Nr.js 580.32 kB`, built in 332 ms, chunk-size warning (pre-existing) |
| `cd frontend/frontend && npm run lint` | **FAIL — pre-existing.** exit 1, 13 problems (11 errors, 2 warnings). All `no-unused-vars` / `react-hooks` in `Dashboard.jsx`, `ETAPrediction.jsx` (6:7 `trains`, 109:10 `loading`), `JourneyManagement.jsx`, `NetworkMap.jsx`, `Simulation.jsx`, `Trains.jsx`. **Not my doing; will not be "fixed" to turn green.** Phase 5 must show the same 11 errors (or fewer only in files I legitimately touch). |
| `cd backend && npm ci && npm test` | **pass** — 14/14 (`# pass 14 # fail 0`) |
| `pip install -r requirements.txt -r requirements-dev.txt` | **pass** |
| `python3 -m pytest -q` | **pass** — `140 passed, 3 warnings in 6.81s` |
| `python3 -m training.pipeline --config configs/dataset.synthetic552.json` ×2 | **pass** both runs |

Training determinism (run 1 `delay-v3-20261020T062004Z` vs run 2 `delay-v3-20261020T062136Z`):

```
metrics:         identical=True
selection:       identical=True
split:           identical=True
features:        identical=True
delay_bands:     identical=True
artifact_sha256: identical=False   <-- joblib bytes are not reproducible
```

**Phase 4 must assert byte-identity on `metadata["metrics"]`, not on `artifact_sha256`.** The joblib
serialisation is not byte-reproducible across runs even with `seed: 42`; the metrics are.

Baseline metrics (from `metrics_before.json`, model `delay-v3`, split 337/104/111, test from 2025-12-28):

- `test_point_p50.mae_minutes` = 21.8227372270762
- `test_baseline_global_mean.mae_minutes` = 24.7356131641846
- `beats_baseline` = **true** (by 2.91 min MAE)
- `test_intervals.coverage` = 0.7027 against `nominal_coverage` 0.80 (**under-covered**)
- `test_intervals.mean_width_minutes` = 56.947
- `test_point_p50.r2` = 0.0749
- `test_band_from_p50_accuracy` = 0.5045
- `test_binary_classifier`: roc_auc 0.6875, pr_auc 0.8016, brier 0.2047, accuracy 0.6847

The interval under-coverage (70.3% measured vs 80% nominal) must be stated wherever the interval is
shown. "Confidence 0.70" is measured test-set coverage, not per-prediction confidence.

### Server-side role enforcement — measured, not assumed

MongoDB 7 via a pre-existing Docker container `railpulse-mongo` (started, not created, by this session).
FastAPI on `127.0.0.1:8000`. Live probes:

| Route | anon | PASSENGER | STAFF | ADMIN |
|---|---|---|---|---|
| `GET /network/trains/{n}/delay-propagation` | 401 | 403 | 200 | 200 |
| `GET /network/trains/{n}/operational-risk` | 401 | 403 | 200 | 200 |
| `POST /simulation/update` | 401 | 403 | 200 | 200 |
| `POST /demo/reset` | 401 | 403 | 403 | 200 |
| `POST /reference/load` | 401 | 403 | 403 | 200 |
| `GET /trains`, `GET /alerts`, `GET /trains/{n}/predictions` | 401 | 200 | 200 | 200 |
| `GET /health/` | **200** | 200 | 200 | 200 |
| `GET /docs/capabilities` | **200** | 200 | 200 | 200 |

FastAPI enforcement is real. The two public routes are intentional today but `/health/` leaks the
full evaluation metrics (see Observations).

### Fabrication baseline grep (before any change)

```
grep -rnE "Math\.random|faker|lorem" frontend/frontend/src "prediction model/railpulse-frontend/js" "prediction model/railpulse-frontend/css"
-> no matches
grep -rnE "\b(28\.7|25\.4|22\.606|23\.979|59/20/21)\b" <both frontends>
-> no matches
```

---

## Confirmed data-availability matrix (against real responses, not docs)

Legend: **Now** = shippable this session with existing endpoints. **D3** = needs the evaluation export. **Blocked** = no data at all.

| # | Chart | Verdict | Exact source |
|---|---|---|---|
| 1 | Scheduled vs predicted vs actual arrival | **Now, minus "actual"** | `scheduled_arrival` from `GET /trains/{n}/state`; `predicted_eta`, `eta_lower`, `eta_upper` from `POST /predict/eta`. No actual-arrival feed exists anywhere. "Actual" only inside historical evaluation (D3). |
| 2 | Predicted vs actual delay scatter | **D3** | Needs per-test-row `{actual, p50}`. Aggregates only today. |
| 3 | Delay trend over time | **Now (predicted)** / D3 (observed) | Predicted: `GET /trains/{n}/predictions` → 8 rows per train with `timestamp`, `delay_p10/p50/p90_minutes`, `predicted_eta`, and the full `input_snapshot` (so scheduled-vs-predicted over time is plottable). Observed trend needs D3. |
| 4 | Residual distribution | **D3** | Not exposed today. |
| 5 | Model vs baselines | **Now (2 bars)** / D3 or metadata passthrough (15 rows) | `/health` → `model_quality.test_mae_minutes` vs `baseline_mae_minutes`; `model_details.metrics.test_baseline_global_mean`. The 15-row candidate CV table lives in `metadata.selection.cv_table` and is **not** served today. |
| 6 | Prediction interval P10/P50/P90 | **Now** | `delay_p10/p50/p90_minutes` + `eta_lower`/`eta_upper` on every `PredictionResponse`; historical coverage `metrics.test_intervals`. |
| 7 | Early / on-time / late | **Now, bands only** | Model bands `ON_TIME, MINOR, MODERATE, MAJOR, SEVERE` from `metadata.delay_bands` / `delay_category`. Dataset has no negative delays → **no "early" bucket**. |
| 8 | Route and station analytics | **Per-train: Now.** Station-level: **Blocked** | Per-train held-out error: `/health` → `metrics.test_error_by_segment.train_number` (12 rows: mae_minutes, bias_minutes, actual_mean, count) and `.run_frequency` (3 rows). Per-train observed dataset stats: `/reference/trains?q=`. Station-level: the dataset has origin/destination only (`route.stops_available: false`) — document it. |
| 9 | Simulation / scenario comparison | **Now, labelled rule-based** | Node simulation is rule-based. `POST /simulation/update` only stores state. 13 request fields are in `unsupported_fields_ignored` (incl. `current_delay_minutes`, `junction_congestion`, `track_occupancy`, `platform_availability`, `trains_in_section`) — the model ignores them. An ML scenario may vary only `distance_remaining_km`, `scheduled_arrival`/time-of-day, day-of-week, route, `season`, `run_frequency`, `train_type`. |
| 10 | Feature importance | **Not available** | Training exports none. `/health` gives the 15 `features` and the `excluded_features` reasons — I will show *which features the model uses and which it provably ignores*, and an explicit "Importance not available: the trainer exports none" state. Permutation importance only if D3 is approved and only computed on held-out data. |

Bonus, newly found and honest without D3: **interval calibration curve** from
`metrics.test_binary_calibration` (3 bins: mean_predicted vs observed_rate), labelled as
probability calibration of the P(delay>15) classifier on the held-out test set.

---

## Surface inventory (D1 default = the ML app)

Files I expect to touch in `prediction model/railpulse-frontend`:

| File | Role |
|---|---|
| `js/app.js` (251 lines / 43 KB) | router, all 7 page renderers, `escapeHtml`, formatters |
| `js/api.js` (60) | fetch wrapper, status→message map |
| `js/config.js` (4) | `apiBaseUrl`, `healthPollMs: 30000`, `requestTimeoutMs: 12000` |
| `js/state.js` (48) | session + selected-train state |
| `css/style.css` (1506) | tokens + all classes |
| `index.html` (23) | shell, `#toast-region` |
| NEW `js/charts.js` | dependency-free SVG chart module (D2) |
| NEW `js/ui.js` | skeleton/empty/error/stale/degraded states, badges, source footer |
| NEW `js/format.js` | time/number formatters, count-up |
| NEW `tests/` (Node test runner or a small headless harness) | chart module unit tests |

Reusable CSS tokens: `--ink --muted --line --paper --sand --sand-dark --orange --orange-dark
--green --red --shadow --radius --display --body`. No dark-mode block exists; I will not add one.
Chart series beyond 3 will need 1–2 additional tokens derived from this palette (extension, as rule 17 allows).

Reusable classes I will build on rather than replace: `.panel .panel-heading .metric-card .metric-grid
.metric-label .skeleton .skeleton-large .skeleton-table .empty-hero .empty-icon .table-wrap
.status-chip .status-dot .health-ok .health-degraded .health-error .timeline .timeline-stop
.reveal .sr-only .eyebrow .muted .unit .tag-cloud .button .button-primary .button-secondary`.

Existing API calls in `app.js` (line → path): 99/151 `/trains`; 125 `/reference/trains?q=`;
138 `/reference/stations?q=`; 174 `/trains/{n}/state`; 181 `/trains/{n}/predictions`;
184 `/alerts?limit=50`; 190 `/docs/capabilities` + `/network/trains/{n}/*`; 194/223 `/health/`;
201 `/auth/register`, `/auth/login`; 202 `/simulation/update`; 209 `/demo/{seed,refresh,reset}`;
211 `/trains/{n}/state` + `/predict/eta`.

React main site (D4 default scope = `ETAPrediction.jsx` only): consumes `GET /api/trains/:id/eta`
via `services/etaService.js`. Node returns `scheduledEta, predictedEta, delayMinutes,
confidenceMinutes, riskLevel, mainCause, predictionSource, fallbackReason, modelVersion`, plus on
the ML path `delayCategory, delayP10Minutes, delayP50Minutes, delayP90Minutes,
probabilityDelayOver15, trainKnownToModel, dataProvenance, beatsBaseline, modelNotice` and a
non-persisted `modelStatus`.

---

## Decisions (defaults applied unless overridden)

- **D1 — Surface: the ML app.** Default taken. It has server-enforced roles and direct FastAPI access,
  so no new Node proxy is needed for evaluation reads.
- **D2 — Charts: in-house dependency-free SVG module.** Default taken. No new dependency, no CDN.
  Planned primitives: line, area, bar, scatter, histogram, interval band, progress track; each with
  tooltip (keyboard reachable), legend toggle, `aria-label` summary, "View as table" toggle,
  non-colour encoding (dash pattern / marker shape / direct label), and downsampling above ~1,000 points.
- **D3 — Evaluation export: recommended APPROVE, with two amendments.** See below.
- **D4 — Main-site scope: `ETAPrediction.jsx` polish only.** Default taken.

### D3 as I propose to implement it

(a) `training/trainer.py` — in `_evaluate`/`run`, *after* the existing evaluation completes, additionally
write `reports/evaluation.json`. All inputs are already in scope at
`training/trainer.py:129` (`_evaluate(self, test, yte, point_test, quantile_test, probability_test, ...)`),
so nothing new is fitted or scored. Content:

```
{
  "dataset":   {name, rows, distinct_trains, date_range, sha256, provenance, path},
  "split":     {strategy, train_rows, validation_rows, test_rows, train_end, test_start},
  "model":     {version, model_version, trained_at, git_commit, seed},
  "aggregates": <the existing metrics dict, verbatim>,
  "candidates": <metadata.selection.cv_table, verbatim: 15 rows>,
  "test_rows": [{journey_date, train_number, season, run_frequency,
                 actual_delay_minutes, p10, p50, p90, p_delay_gt_15}, ... 111 rows]
}
```

**Amendment 1:** `reports/` is *tracked* in git (`reports/eda.md`, `reports/model_comparison.md`), so an
unignored `reports/evaluation.json` would dirty the working tree on every training run and commit 111
synthetic test rows. I propose adding `reports/evaluation.json` to
`prediction model/railpulse-backend/.gitignore`. The endpoint's `404 evaluation_unavailable` path already
covers its absence. **Please confirm — this is the only `.gitignore` edit I would make.**

**Amendment 2:** `test_rows` carries no station-level or personal data; it is 111 rows of synthetic
delays. Still, it is held-out evaluation detail, so the endpoint is ADMIN-only as specified.

(b) `GET /api/v1/model/evaluation`, new router `app/api/routes/model.py`,
`Depends(require_roles("ADMIN"))`, reads the file read-only, returns it as-is, or
`404 {"detail": "evaluation_unavailable"}`. Proof obligations: `metadata["metrics"]` byte-identical
before/after (not `artifact_sha256`), and `openapi.json` diff showing only the added path + schemas.

If D3 is declined, charts 2 and 4 ship as explicit "Not available" states, chart 5 ships with 2 bars
instead of 15, chart 8 ships per-train held-out error from `/health` (unaffected), and chart 10 stays
"Not available".

---

## One open question — timezone (rule 20 contradicts the code)

Rule 20 says to label times IST (`Asia/Kolkata`). The code does not agree:

- `app/ml/predictor.py:145-148` attaches **UTC** to naive datetimes.
- `app/services/demo_data_service.py:77/118/126/154` builds demo state from `datetime.now(timezone.utc)`.
- `PredictionResponse.predicted_eta` / `eta_lower` / `eta_upper` come back **UTC-aware** (`...Z`).
- But `GET /trains/{n}/state.scheduled_arrival` and `current_timestamp`, and every
  `input_snapshot` / history `timestamp`, come back **naive**: `"2026-09-28T15:53:46.587000"`.
- The source CSV holds bare wall-clock times (`Sc_arr__time = 06:00:00`) that are *nominally* Indian
  local time, and the cleaning code never converts them — they are consumed and served as if UTC.

So the API's own numbers are UTC, while the underlying clock values were authored as IST. Rendering
them as IST would shift every displayed time by +5:30 relative to what the backend means; rendering
them as UTC is faithful to the API but 5:30 off the railway timetable the data was generated from.

**My recommended default, which I will use if you do not answer:** format every datetime as
**UTC, explicitly labelled "UTC"**, treating naive values as UTC exactly as `predictor.py` does, and
put one sentence in the provenance panel stating that the synthetic source times were authored as
Indian local wall-clock and are served without conversion, so they are not timetable-accurate.
That is truthful to both the API and the data. The alternatives are: (b) convert the UTC-aware values
to IST for display and leave naive ones labelled "UTC (unconverted)" — mixed and confusing;
(c) a backend timezone fix, which is out of scope under rules 9/10.

---

## Risks

1. **`app.js` is 43 KB of very long lines.** Adding three role-specific dashboards inline will make it
   unmaintainable. Mitigation: new page modules (`js/pages/*.js`) imported by `app.js`, leaving the
   existing renderers in place. No reformatting of untouched lines (rule 13).
2. **Honest surfaces will look empty.** Alerts always empty, upcoming-stations one stop,
   feature importance absent, demo data 22 days stale. The staff dashboard in particular will be
   mostly *Not available* panels. This is correct per rules 1/7 but will read as "unfinished" —
   I will make the limitation copy the content, not an error.
3. **Interval under-coverage (0.70 vs 0.80 nominal)** makes the headline "confidence" figure
   misleading if shown as a percentage without context. Must be phrased as measured coverage, with
   the shortfall stated.
4. **`/health` is public and carries full evaluation metrics.** If I build the ADMIN model page on
   `/health`, the data behind it is readable by anyone. Listed as an Observation; not fixed without approval.
5. **Pre-existing lint failure (11 errors)** means `npm run lint` can never be shown green.
   Phase 5 reports it as pre-existing with the same count.
6. **`npm run lint` touches `ETAPrediction.jsx`, which D4 asks me to edit.** Two of the 11 errors are in
   that file (unused `trains`, unused `loading`). If my edit happens to use them the count drops; I will
   report the exact delta rather than claiming a fix.
7. **MongoDB is a container I did not create.** `railpulse-mongo` (mongo:7) existed stopped; I started it.
   A fresh session must `docker start railpulse-mongo` before any live check.
8. **Demo/reference data must be seeded** for the UI to show anything: `POST /demo/seed` (STAFF) and
   `POST /reference/load` (ADMIN). Both done in this session's database.

---

## Observations (not fixed — carry into the Phase 5 report)

1. **Unauthenticated Node routes.** Every `backend/src/routes/*.js` except `auth.routes.js` and
   `eta.routes.js` has no `authenticate`/`authorize`: trains CRUD, alerts, operations, simulation,
   network, journey, propagation, risk, bottleneck, train-events. The React role gating on
   `/operations` and `/simulation` is cosmetic, not security. Not described as security anywhere in
   my work; no restricted data placed behind it. Not fixed — awaiting approval.
2. **`GET /api/v1/health/` is public and returns the complete `metrics` dict**, including per-train
   held-out error and bias, classifier calibration and both baselines. Model evaluation detail is
   therefore already world-readable on a running instance, which partly undercuts making
   `/model/evaluation` ADMIN-only. Not fixed — out of scope under rule 9.
3. **Default credentials are hardcoded in a committed script**,
   `prediction model/railpulse-backend/scripts/ui_smoke.py:25`. Pre-existing. Phase 5's extension will
   read them from the environment instead of adding more literals, but I will not alter the existing line
   without approval.
4. **`reports/model_comparison.md` is tracked and stale** (59/20/21 split) and nothing regenerates it in
   `training.pipeline`. Anyone reading it gets wrong numbers. Not fixed.
5. **Source-data defects are served verbatim**: `run_frequency: "Daliy"`, trailing space in
   `"RANI KAMLAPATI "`, `current_section: "Unknown"`, `current_station: "In-transit"`. Display will trim
   whitespace only.
6. **`frontend/frontend` has 1 high-severity npm audit finding** (pre-existing, untouched).

---

## Next (Phase 1) — file-level plan, pending approval

1. `js/format.js` — IST/UTC-explicit datetime formatting (per the answer above), number/percent/minutes,
   relative + stale threshold, count-up that fires on first paint and on real value change only,
   `prefers-reduced-motion` guard. Numbers render immediately; animation never gates display.
2. `js/charts.js` — the D2 primitives, SVG only, `textContent`/SVG text nodes for all API-derived
   labels (rule 15), downsampling above ~1,000 points, 5,000-point handling, keyboard-focusable
   tooltips, legend toggle, table view, `aria-label` summary.
3. `js/ui.js` — `skeleton()`, `emptyPanel()` (reuse existing), `errorPanel()`, `stalePanel()`,
   `degradedPanel()`, `notAvailablePanel(reason)`, `badge('live'|'historical'|'synthetic')`,
   `sourceFooter(endpointOrFile)`.
4. `css/style.css` — append a chart block using existing tokens, plus 1–2 derived series tokens.
   No edits above the append point.
5. Tests — Node test runner unit tests for scale/downsample/band/formatting pure functions, using the
   committed-nowhere fixtures in the scratch dir. Fixtures stay in tests; no demo page that ships fake data.
6. Verification task — `grep -rnE "Math\.random|faker|lorem"`, literal-metric grep, `npm run build`
   (React untouched), `pytest -q`, and the chart unit tests. Commit.

### Per-phase file plan (outline)

- **Phase 2 (PASSENGER):** `js/pages/passenger.js` (new) + `app.js` route wiring.
  Charts: interval band (chart 6), scheduled-vs-predicted (chart 1), prediction-history sparkline (chart 3).
  Route timeline from `/reference/trains/{n}/route` + `/trains/{n}/upcoming-stations`, two nodes, with
  the `limitation` string shown. No metrics, no feature lists.
- **Phase 3 (STAFF):** `js/pages/staff.js` (new). Alerts = *Not available* panel from `limitation`.
  Predicted-vs-scheduled table with interval indicators, predicted-delay trend, delay-band
  distribution (bands only, no "early"), per-train drill-down, scenario comparison labelled rule-based
  with the ignored-fields list shown explicitly.
- **Phase 4 (ADMIN + D3):** `js/pages/admin.js` (new), `app/api/routes/model.py` (new),
  `app/main.py` (one `include_router` line), `training/trainer.py` (one additive write),
  `.gitignore` (one line, pending Amendment 1 approval). Visually separate *Historical evaluation*
  from *Live*.
- **Phase 5:** extend `scripts/ui_smoke.py`; screenshots to `reports/figures/ui/`.


---

## Phase 1 — foundations (done)

Gate defaults were applied, since no override was given: **D1** ML app, **D2** in-house SVG module,
**D4** `ETAPrediction.jsx` only. **D3** stays pending until Phase 4; its `.gitignore` amendment is
still unanswered and nothing has been changed in the backend. The timezone default was applied:
**times render in UTC, explicitly labelled**, with the provenance caveat shown on screen.

### Files added

| File | Lines | What |
|---|---|---|
| `js/format.js` | 232 | `finite`, timezone policy + `parseInstant`/`formatInstant`/`formatClock`/`formatDay`, `age`/`describeSpan`, number & duration formatting, `cleanLabel`, `prefersReducedMotion`, `countUp` |
| `js/chart-core.js` | 296 | DOM-free geometry: scales, `niceTicks`, `downsample`, `histogram`, `bandFor`, `tableFromSeries`, `summaryText`, path + marker builders, `nearestIndex`, `SERIES_STYLES` |
| `js/charts.js` | 764 | SVG rendering: line/area, bar, scatter, histogram, interval band, progress track, sparkline; legend, table view, read-out, reveal, ResizeObserver |
| `js/ui.js` | 278 | `escapeHtml`/`raw`, `badge`, `provenanceBadges`, `baselineVerdict`, `coverageNote`, `sourceFooter`, `skeleton`/`emptyState`/`errorState`/`staleBanner`/`degradedBanner`/`notAvailable`, `panel`, `chartMount`, `metaList`, `metricTile`, `timeNotice` |
| `tests/chart-core.test.js` | 366 | 49 assertions over the pure chart layer |
| `tests/format.test.js` | 262 | timezone, staleness, formatting, count-up |
| `tests/ui.test.js` | 277 | escaping sweep + truthfulness of every verdict/note |
| `package.json` | 11 | **no dependencies**; `npm test` = `node --test tests/`, `npm run serve` |

`css/style.css`: **appended only**, 1506 → 2019 lines. Nothing above the original last line was
edited. Adds `--chart-*` tokens and the `.chart-*` / `.rp-*` classes.

`js/app.js`, `js/api.js`, `js/state.js`, `js/config.js`, `index.html`: **untouched this phase.**
The new modules are not wired into any page yet; that starts in Phase 2.

### Decisions taken

1. **Chart text goes through DOM nodes, never string templates.** `charts.js` builds everything with
   `createElementNS` and `textContent`, so no API-derived chart label can become markup. `ui.js`
   returns strings because `app.js` composes with `innerHTML`, so every `ui.js` function escapes its
   own input and `raw()` is the single, explicit opt-out.
2. **Keyboard tooltips are one focusable plot with arrow-key stepping**, not one focusable node per
   point. Per-point focus would blow the node budget on long series. `Home`/`End`/`Escape` work; the
   read-out is a polite live region.
3. **Non-colour encoding is dash pattern + marker shape + direct legend label.** A unit test asserts
   that the dash+marker pair is unique across all five series roles, so the chart is readable in
   greyscale.
4. **Contrast was measured, not assumed** (see the CSS comment block for the numbers). Marks are
   treated as graphics (WCAG 1.4.11, 3:1) and text as text (1.4.3, 4.5:1), which is why
   `--chart-predicted` (#e8632d, 3.31 on paper) is used for strokes while
   `--chart-predicted-text` (#bd431a, 5.19) is used for legend copy. Two real failures were found
   and fixed: legend chips moved from `--sand` to `--paper` (green would have been 4.48), and the
   toggled-off state moved to full `--ink` on `--sand-dark` (`--muted` on `--sand` was 4.12).
5. **Motion is belt-and-braces off.** `charts.js` skips the reveal clip entirely under
   `prefers-reduced-motion`, and the CSS block already at `style.css:1497` forces
   `transition-duration: .01ms !important` globally. Verified: zero reveal/clip elements under
   emulation. `countUp` writes the final number synchronously *before* deciding to animate, and
   animates only on first paint or a real value change — an unchanged 30s poll animates nothing.
6. **No demo page is committed.** The fixtures-driven harness used to verify the DOM layer lived in
   the scratch dir and was deleted after the run.

### The bug that kept recurring — worth knowing before Phase 2

`Number(null)`, `Number('')`, `Number(false)` and `Number([])` are all **0**, and `Number.isFinite(0)`
is `true`. Guarding with `Number.isFinite(Number(x))` therefore turns a *missing* API field into a
*real zero*. The unit tests caught **seven** instances of this across three files, including:

- `formatDelayMinutes(null)` rendered **"on time"** — stating a train was punctual when the API sent
  no delay at all.
- `coverageNote(null)` rendered **"contained the true arrival 0.0% of the time on the held-out test
  split"** — reporting a measurement that was never taken.
- `baselineVerdict({test_mae_minutes: null, baseline_mae_minutes: 24.7})` claimed the model beat its
  baseline **"by 24.7 minutes"** — a fabricated margin.
- Line charts plotted missing points at y=0 instead of breaking the line.

All now route through one `finite()` guard exported from `format.js` (accepts only numbers and
non-blank numeric strings). **Phase 2 onward: never use `Number()` on an API value; use `finite()`.**

### Verification — commands run and real results

| Command | Result |
|---|---|
| `cd "prediction model/railpulse-frontend" && npm test` | **pass — 150 tests, 34 suites, 0 fail** |
| Playwright DOM check at 1280 / 768 / 360 / 360+reduced-motion | **PASS** (see below) |
| Existing ML app at `localhost:3000` | **0 console errors, 0 page errors**, renders, no h-scroll at 360 |
| `cd frontend/frontend && npm run build` | pass, built in 560 ms (React untouched) |
| `cd frontend/frontend && npm run lint` | **fail — 13 problems (11 errors, 2 warnings), identical to the Phase 0 baseline.** Pre-existing; unchanged by this phase |
| `cd backend && npm test` | pass 14/14 (untouched) |
| `pytest -q` | pass 140 (untouched) |
| `grep -rnE "Math\.random\|faker\|lorem"` over `js/`, `css/`, `tests/` | **no matches** |
| `grep -rnE "(28\.7\|25\.4\|22\.606\|23\.979\|21\.82\|24\.73\|0\.7027)"` over `js/`, `css/` | **no matches** — no metric is hardcoded in shipped code |
| `grep -rn innerHTML` in the four new js modules | only two occurrences, both in comments |

Playwright results, every viewport identical unless noted:

```
[1280] cards=8 svgs=7 empty=1 focusable=5 svgNodes=811 hscroll=False
       noAria=0 noSource=0 consoleErr=0 pageErr=0
   keyboard: focus -> ArrowRight -> 'run 2 - Predicted P50 83.9 - Snapshot delay 17.0'
             End          -> 'run 8 - Predicted P50 15.7 (range 8.9 to 60.5) - Snapshot delay 45.0'
   table toggle: 8 rows x 3 cols, aria-expanded=true
   5,000-point chart footer: 'showing 600 of 5000 points (min/max per bucket)'
   markup leak through a label: False
[360]  svgNodes=800, hscroll=False
[360-reduced] reveal/clip elements = 0
```

Node budget held at 811 of the ~1,000 ceiling with a 5,000-point scatter on screen.

### A data-availability correction found while verifying

`GET /trains/{n}/predictions` stores and returns `predicted_delay_minutes`, `delay_p10_minutes`,
`delay_p90_minutes`, `p_delay_gt_15`, `delay_category`, `risk_level`, `predicted_eta`,
`predicted_remaining_minutes`, `model_version`, `timestamp`, `data_source` and the full
`input_snapshot` — but **there is no `delay_p50_minutes` field** (`app/api/routes/predictions.py:60`
persists p10, p90 and the probability only). The P50 is `predicted_delay_minutes`, which the schema
documents as "P50 (median) predicted delay".

**Phase 2/3 must read `predicted_delay_minutes` for the history centre line.** Reading
`delay_p50_minutes` yields all-nulls. Also note that p10/p90 are not populated on every stored row,
so the history band is legitimately partial and must be drawn as a gap, not interpolated.

A second defect surfaced from the same fixture: a chart whose *first* series was entirely missing
silently lost its x-axis ticks and its whole keyboard read-out, because both keyed off `series[0]`.
Now both key off `anchorOf()`, the first series that actually has points.

---

## Next: Phase 2 (PASSENGER) — not started

Planned: `js/pages/passenger.js`, wired into `app.js`'s existing `renderPage` switch.
Scheduled vs predicted arrival, time remaining, the P10-P90 window with `coverageNote`, source badge
with fallback reason in plain words, last-updated + `staleBanner` (which will fire by default: demo
data is ~22 days old), route timeline from `/reference/trains/{n}/route` +
`/trains/{n}/upcoming-stations` (two nodes only, with the API's own `limitation` shown), and a
prediction-history sparkline off `predicted_delay_minutes`. No metrics, no feature lists, no debug data.


---

## Timezone decision — RESOLVED (user instruction, 2026-10-20)

**Display zone is now `Asia/Kolkata` ("IST") everywhere.** The Phase 1 UTC default is withdrawn.

Getting there is not uniform, because the backend's datetimes do not all mean the same thing.
`js/format.js` now carries an explicit policy table, `FIELD_TIME_KIND`, with two readings:

| Reading | Fields | Treatment |
|---|---|---|
| `WALL_CLOCK` | `scheduled_arrival`, `predicted_eta`, `eta_lower`, `eta_upper`, `scheduledEta`, `predictedEta` | digits are Indian local wall-clock; rendered as IST unchanged |
| `INSTANT` (default) | `current_timestamp`, `updated_at`, `timestamp`, `trained_at`, `predictionTimestamp`, `retrieved_at` | a true point in time; naive means UTC; converted to IST |

Anything not listed defaults to `INSTANT`, the safe direction: rendering a true instant in IST is
correct, whereas wrongly treating an instant as wall-clock silently shifts it 5h30m.

### Why the ETA family is WALL_CLOCK despite carrying a "Z"

`app/ml/predictor.py:141` anchors on `scheduled_arrival or current_timestamp`; line 147 stamps UTC
onto a naive value with `replace(tzinfo=utc)`. The ETA therefore inherits the anchor's wall-clock
digits plus a timezone it never had. Measured against the running backend:

```
scheduled_arrival        2026-10-21T06:00:00          (naive)
predicted_eta            2026-10-21T06:06:55.306953Z  (the Z is synthetic)
predicted_eta - scheduled_arrival = 6.921782550 min
predicted_delay_minutes           = 6.921782546 min   -> the same number
```

Honouring that Z would print **06:00 IST scheduled against 11:36 IST predicted — a 337-minute
delay the model never produced**. Reading it as wall-clock keeps the screen consistent with the
model's own output. Conversely, reading a naive `current_timestamp` as Indian local would push a
just-written state 5h30m into the future and invert the staleness verdict. Both failure modes are
pinned by tests.

Genuinely-aware timestamps are preserved and converted properly: `...Z`, `+05:30` and `-05:00`
spellings of the same instant all render identically, including the offset-without-colon form.
Durations (`predicted_delay_minutes`, the quantiles, `predicted_remaining_minutes`) carry no zone
and are untouched by any of this.

**Assumption stated on screen,** not only in comments: `TIME_NOTICE` says the synthetic dataset
records no timezone, so reading its times as Indian local is an assumption about their origin.

Tests added: 20 timezone assertions covering both readings, offset preservation, the two regressions
above, date-boundary crossing in both directions, 24-hour formatting and the field-classification table.

## `.gitignore` amendment — PROPOSED, NOT APPLIED

Shown for approval; it will only be applied in Phase 4 if D3 proceeds.

```diff
--- prediction model/railpulse-backend/.gitignore (current)
+++ prediction model/railpulse-backend/.gitignore (proposed)
@@ -51,3 +51,9 @@
 data/processed/
 data/raw/
 models/
+
+# Per-row evaluation export, rewritten by every training run (Phase 4 / gate D3).
+# Only this one file: reports/eda.md, reports/model_comparison.md and
+# reports/figures/ stay tracked. GET /api/v1/model/evaluation returns
+# 404 evaluation_unavailable when it is absent.
+reports/evaluation.json
```

- **Excludes:** exactly one generated file, `reports/evaluation.json` — 111 rows of synthetic
  held-out predictions plus aggregates, rewritten by every `training.pipeline` run.
- **Hides no required file.** Verified against `git ls-files`: no tracked path matches. All 7
  tracked files under `reports/` (`eda.md`, `model_comparison.md`, 5 figures) stay tracked.
- **Scope:** a literal path, no wildcard, anchored to the backend directory. `reports/` itself is
  not ignored.
- **Why:** without it, every training run dirties the working tree and invites committing generated
  per-row output. The endpoint's `404 evaluation_unavailable` path already covers the file's absence.

---

## Phase 2 — passenger experience (done)

Role `PASSENGER`, in the ML app. One question answered: *when will my train arrive, and how sure is
that?* Staff and admin renderers are untouched.

### Files

| File | Change |
|---|---|
| `js/pages/passenger.js` | **new**, 470 lines — dashboard, track-train, history, alerts |
| `js/app.js` | +27 / −2: import, a PASSENGER branch in `renderPage`, and `goToTrain()` |
| `js/format.js` | timezone layer rewritten (see above) |
| `css/style.css` | appended again, 2019 → 2153 lines |
| `tests/format.test.js`, `tests/ui.test.js` | retargeted to IST, 20 timezone assertions added |

### What the passenger sees

- **Three times side by side:** scheduled, predicted (emphasised), and journey left to run.
- **The answer in words**, not just numbers: "The model expects this train to arrive **+6.9 min**
  against its schedule"; "Most likely somewhere between **06:01 IST** and **06:26 IST**".
- **Risk phrased to resist over-reading:** "Chance of arriving more than 15 minutes late: **44%** —
  about 44 in 100 journeys that look like this one to the model."
- **Interval chart** with the scheduled time as the zero reference, P10/P90 labelled directly.
- **`coverageNote`** stating the measured 70.3% against the 80% it aims for, and that this is
  coverage across a test split rather than confidence in this one prediction.
- **Route timeline** where each node is labelled with where its information comes from (Timetable /
  Reported state / Predicted), under a bold "**No part of this route is GPS-tracked**".
- **Prediction history** as a chart plus a table, captioned that these are past estimates and that
  the system never learns the actual arrival time.
- **Stale banner** and the "About this estimate" provenance block.

Deliberately absent, per the brief: no MAE, no baseline numbers, no feature or ignored-field lists,
no model internals. A grep in the verification run confirms none of those strings reach the page.
Rule 4 is still honoured — if `beats_baseline` ever goes false, a plain-words sentence appears in
"About this estimate"; passengers get the sentence, never the metrics.

### Three honesty traps found and handled

1. **`predicted_remaining_minutes` is measured from the state's `current_timestamp`, not from now.**
   It equals `(scheduled_arrival − current_timestamp) + predicted_delay`, verified numerically. On a
   stale state that is a completely different number from "time from now", so it is labelled
   "measured from HH:MM IST, not from now" and the reading's age is appended when stale. No
   countdown is shown, because nothing here updates in real time.
2. **`TrainStateRequest` has no `data_source` field**, so a DEMO train's prediction returns
   `data_source: "LIVE"`. The input's origin is therefore read from the stored state and never from
   the prediction response; demo journeys are badged from the state.
3. **`/alerts` can never return rows.** An empty inbox would read as "no problems", so the page
   shows the API's own `limitation` plus: "This is not a statement that your train is running
   normally. No alerting exists here at all, so nothing can be reported either way."

### Two pre-existing bugs fixed in passing

- **`navigate()` to the current hash fires no `hashchange`**, so picking a train while already on the
  train page left the previous train on screen. `goToTrain()` re-renders in place instead. Affects
  all roles; it is a correctness fix, not a refactor.
- **Scroll position survived the re-render**, leaving the answer above the viewport after choosing a
  train from the list (measured `scrollY` 506). `goToTrain()` now returns to the top, honouring
  `prefers-reduced-motion`.

### Verification — commands run and real results

| Check | Result |
|---|---|
| `npm test` (ML frontend) | **162 tests, 36 suites, 0 fail** |
| Passenger journey at 1280 / 768 / 360 / 360+reduced-motion | **PASS** — 0 console errors, 0 page errors, no horizontal scroll, 28–29 `HH:MM IST` times, 2 charts, topbar clear of content, 0 reveal elements under reduced motion |
| Passenger alerts | renders the *Not available* state and the "not a statement that your train is running normally" line |
| STAFF + ADMIN regression, 13 pages | **PASS** — every page renders, 0 console errors, 0 page errors |
| `grep -rnE "Math.random\|faker\|lorem"` | no matches |
| hardcoded metric literals | no matches |
| `Number(` in `js/pages/passenger.js` | none — all API values go through `finite()` |
| `cd backend && npm test` | 14/14 (untouched) |
| `pytest -q` | 140 passed (untouched) |
| `cd frontend/frontend && npm run build` | pass, 466 ms (untouched) |
| `cd frontend/frontend && npm run lint` | **13 problems (11 errors, 2 warnings) — identical to the Phase 0 baseline** |

Screenshots: `scratchpad/phase2/journey-final-{1280,360}.png`, `passenger-{dashboard,alerts,history}-*.png`.

### New observation for the final report

`scrollToUpdate()` in `js/app.js` calls `scrollIntoView({ behavior: 'smooth' })` unconditionally,
ignoring `prefers-reduced-motion`. Pre-existing, and only reachable from the staff/admin `predict`
path, which Phase 3 touches. Not fixed yet; my own scroll helper honours the preference.

Also seen while testing: the dev Mongo holds residue from earlier sessions — trains numbered
`string` and `FRONTEND-TEST-123` with `data_source: CSV_LIVE`, which no code in this repo writes.
The UI handles them without breaking (placeholders for the missing schedule), but they are not
produced by this codebase.

---

## Next: Phase 3 (STAFF) — not started

Operational overview first (alerts as an honest *Not available* panel, plus stale/degraded banners),
then charts, then tables and drill-down. Train/date filters and search, predicted-vs-scheduled table
with interval indicators, predicted-delay trend, delay-band distribution using the model's own bands
only (no "early" bucket — the dataset has no negative delays), the existing simulation and
network-intelligence pages kept and improved, and scenario comparison labelled rule-based with the
13 ignored request fields shown explicitly.


---

## Phase 3 — staff experience (done)

Role `STAFF`, in the ML app. ADMIN still uses the original renderers; Phase 4 moves it.

### Files

| File | Change |
|---|---|
| `js/pages/staff.js` | **new**, 700 lines — overview, fleet table + filters, drill-down, history |
| `js/pages/operations.js` | **new**, 370 lines — scenario comparison, network intelligence |
| `js/app.js` | +27 / −2: imports, a STAFF branch, three new actions, a filter listener |
| `css/style.css` | appended again, 2153 → 2363 lines |
| `tests/operations.test.js` | **new**, 12 assertions for `shiftWallClock` |

### Ordering, as briefed

Operational overview first: degraded banner, a stale-state count banner, a baseline-loss banner that
appears only if `beats_baseline` goes false, four KPI tiles, then the alerts panel. Charts next
(delay-band distribution, latest predicted delay by train). Then the table, then one train in detail.

### The constraint that shaped the whole module

`POST /predict/eta` is **not read-only**. It writes a row to the train's prediction history *and*
upserts the live state (`app/api/routes/predictions.py:52-70`, `train_repository.py:21-28`). A fleet
view that predicted on load would write 16 rows and mutate 16 live states on every page view.

So nothing here predicts on load. `loadFleet()` makes one read-only
`GET /trains/{n}/predictions?limit=50` per train; the newest entry doubles as "the latest
prediction", so the trend chart and the fleet table come from the same single request per train.
A prediction happens only when a staff user clicks for one, and the button says what it will do.

### Scenario comparison

The rule-based engine the brief mentions lives in the Node service and is **not reachable from this
portal**, and FastAPI's `/simulation/update` only stores a state. Rather than dress a stored state up
as a scenario engine, the page says that plainly in a *Not available* card and offers an ML scenario
comparison instead.

What a scenario may vary is dictated by the model: nine of the fifteen features derive from
`scheduled_arrival`, so shifting the schedule is the one lever offered. The page lists the features
the model uses and the thirteen it ignores, and adds that **`distance_remaining_km` is ignored too**
for a train the model knows, because `training/feature_contract.py:161` looks the route distance up
by train number and uses the request value only as a fallback for an unknown train.

Because each run rewrites the stored state, the tool:

- states the consequence in a banner before anything runs;
- requires an explicit acknowledgement checkbox, and refuses to run without it;
- runs scenarios **sequentially**, since parallel runs would race on one document;
- replays the original payload in a `finally` block, so the stored state ends as it started and the
  newest history row reflects the train's real schedule.

Measured end to end against the live backend:

```
BEFORE: scheduled_arrival = 2026-10-21T06:00:00 | history rows = 19
  guard blocks an unacknowledged submit: True
  5 scenarios ran, 5 table rows, 1 chart, 0 console/page errors
AFTER : scheduled_arrival = 2026-10-21T06:00:00 | history rows = 25
STATE RESTORED: True        (history grew by 6 = 5 scenarios + 1 restore)
newest history row scheduled_arrival = 2026-10-21T06:00:00
```

The comparison is informative rather than flat — the model does respond to the schedule:
+6.9 min as scheduled, +13.5 six hours earlier, +13.3 six hours later, +5.1 tomorrow, +7.9 next week.

### Other honesty work on this surface

- The drill-down shows reported delay, speed, congestion, occupancy and trains-in-section because
  they describe the stored state, immediately under: "**these are not inputs to the model** …
  changing any of them cannot change a prediction."
- After an explicit prediction, the response's `unsupported_fields_ignored` is echoed as "N fields
  sent with this request had no effect on the result", naming each one.
- Delay bands use the model's own five labels in the model's own order. There is no early band and
  none is invented. A band with zero trains is still drawn, because "none in SEVERE" is information.
- The alerts panel repeats that an empty list is not an all-clear and points at the stale count and
  the band chart instead.
- `MAJOR` and `SEVERE` chips share a red; `SEVERE` additionally carries a heavier rule so the two are
  not separated by colour alone. Stale rows are marked by a rule and an age chip, not by colour.
- The interval column is drawn on a scale shared down the column, so a wide band looks wide. Every
  interpolated value is a number from `finite()`, and the cell carries an escaped text alternative.

### A bug class found and fixed

Four titles were written as `` `… &mdash; train ${escapeHtml(...)}` `` and passed to `panel()` /
`notAvailable()`, which escape their own arguments. That rendered the literal text
"Scenario comparison &mdash; train 12002" on screen, and double-escaped the interpolated value, so a
name containing `&` would have shown as `&amp;amp;`. All four now pass plain text. A sweep across all
six staff pages confirms no HTML entity is visible anywhere.

### Verification — commands run and real results

| Check | Result |
|---|---|
| `npm test` (ML frontend) | **174 tests, 37 suites, 0 fail** |
| Staff portal at 1280 / 768 / 360 / 360+reduced-motion | **PASS** — 0 console errors, 0 page errors, no horizontal scroll, 2 charts, 0 reveal elements under reduced motion |
| Fleet filters | search `12002` → 16 rows to 1; stale filter → 4 of 16; counts reported in the UI |
| Drill-down | renders, and carries the "are not inputs to the model" note |
| Scenario comparison | guard works, 5 scenarios ran, **state restored**, newest history row correct |
| Entity sweep, all 6 staff pages | no visible HTML entities |
| All-role regression (4 + 6 + 7 pages) | **PASS** — every page renders, 0 console errors, 0 page errors |
| `grep` fabrication / hardcoded metrics / raw `Number(` | no matches |
| `cd backend && npm test` | 14/14 (untouched) |
| `pytest -q` | 140 passed (untouched) |
| `cd frontend/frontend && npm run build` | pass, 513 ms (untouched) |
| `cd frontend/frontend && npm run lint` | **13 problems (11 errors, 2 warnings) — identical to the Phase 0 baseline** |

Screenshots: `scratchpad/phase3/staff-{dashboard,trains,history,capabilities,simulation,scenario-result}-*.png`.

### Observations added

- `/predict/eta` mutating the live state is a backend design issue, not a UI one: a caller cannot ask
  for a prediction without also rewriting the stored state. The scenario tool works around it with a
  restore, but a read-only prediction mode would be the real fix. Not changed — rule 9.
- `intervalCells=2` of 16 rows on first load simply reflects that only two trains had stored
  predictions carrying P10/P90; the rest show "Not recorded" rather than a fabricated range.

---

## Next: Phase 4 (ADMIN + D3) — not started

Model health and readiness, active version, training time, dataset provenance and freshness, and
selected-vs-baseline on the same split. Historical evaluation and Live sections separated visually.
Per-train held-out error and the calibration curve come from the public `/health` metrics and need no
D3. If D3 proceeds: implement the evaluation export plus the ADMIN-only endpoint, apply the one-line
`.gitignore` change shown above, then prove `metadata["metrics"]` is byte-identical before and after
(not `artifact_sha256`, which is not reproducible) and that `openapi.json` differs only by the new route.


---

## Phase 4 — admin experience and gate D3 (done)

### D3 — implemented as proposed

**(a) `training/trainer.py`** gains `_write_evaluation_export`, called from `run()` after the
metadata is built. It only reads arrays the evaluation already produced; nothing is fitted, scored or
re-ordered. A write failure is logged and swallowed, so a reporting convenience can never cost a
completed training run. Output: `reports/evaluation.json` — dataset, split, model, the aggregates
verbatim, the 15-row candidate table, and 111 per-row records
`{journey_date, train_number, season, run_frequency, actual_delay_minutes, p10, p50, p90,
p_delay_gt_15, residual_minutes}`.

**(b) `app/api/routes/model.py`** — `GET /api/v1/model/evaluation`, ADMIN only, read-only, returns
the file as-is or `404 {"detail": "evaluation_unavailable"}`. One line added to `app/main.py`.

**`.gitignore`** — the reviewed one-line change applied. `reports/evaluation.json` (48,700 bytes) is
now present on disk and absent from `git status`; all 7 tracked files under `reports/` remain tracked.

#### Proof 1 — training metrics unchanged

```
Phase 0 metrics sha256 : 5b3b842f829f73832398d3daa2b23b417227f238109df341c9eafbebb793a57d
Phase 4 metrics sha256 : 5b3b842f829f73832398d3daa2b23b417227f238109df341c9eafbebb793a57d
BYTE-IDENTICAL         : True
export aggregates match metadata metrics: True
```

Compared against `metrics_before.json` captured in Phase 0, *before any change in this branch*.
As specified, the comparison targets `metadata["metrics"]`, not `artifact_sha256`, which is not
byte-reproducible.

Independent check that the exported rows are the real held-out predictions, not a re-derivation:

```
recomputed P10-P90 coverage from the 111 rows : 0.7027027027
aggregates.test_intervals.coverage            : 0.7027027027   MATCH
residual == p50 - actual for every row        : True
test_rows (111) == metadata split.test_rows (111)
```

#### Proof 2 — OpenAPI differs only by the new route

```
paths added    : ['/api/v1/model/evaluation']
paths removed  : none
existing paths changed   : none
schemas added/removed/changed : none / none / none
tags added     : ['Model Evaluation']
rest of the document identical : True
VERDICT: PASS - additive only
```

#### Proof 3 — authorisation, measured against the running service

| Caller | Result |
|---|---|
| anonymous | **401** `Authentication required` |
| PASSENGER | **403** `Insufficient permissions` |
| STAFF | **403** `Insufficient permissions` |
| ADMIN | **200**, 111 test rows, 15 candidates |
| ADMIN, export moved aside | **404** `{"detail": "evaluation_unavailable"}` |

Also checked from the browser: a signed-in PASSENGER fetching `/model/evaluation` with their own
token gets **403**. Role gating here is server-side, not a hidden link.

9 new tests in `tests/test_model_evaluation.py` cover the 401/403/200 matrix, the absent and
corrupt-file cases (which must be indistinguishable and must leak neither a path nor a stack trace),
that authorisation is checked before the file is read, that the route rejects POST/PUT/DELETE/PATCH,
and that serving the file does not modify it. **Backend suite: 140 → 149 passing.**

### The admin surface

`js/pages/admin.js` (650 lines), two pages; the operational pages (`train`, `history`, `alerts`,
`simulation`, `capabilities`) are shared with STAFF, so admin is staff **plus** the model surface.

**The one structural idea:** *Live* and *Historical evaluation* are different objects on the page,
not just differently worded. Different background, different border style, a coloured inset rule and
a badge in each heading. A measured MAE sitting beside live counters reads as live accuracy, and it
is not: nothing on this system ever compares a prediction against a real arrival after the fact, and
the historical block says so.

- **Live:** service / database / model status, train-state counts, active version, artifact presence,
  load error, environment.
- **Historical:** dataset and training provenance (including dataset SHA-256, training age, split
  sizes and test start), shipped-vs-baseline on the same split with the verdict in plain words,
  interval coverage against its nominal target, per-train and per-frequency error with the bias sign
  explained, probability calibration, and — from D3 — predicted-against-actual scatter with an
  identity line, residual histogram with a zero reference, error over journey date, and the 15-row
  candidate table with the shipped model marked.
- **Fallback and failed-request counts:** an explicit *Not available*. This backend keeps no request
  counters, and the FastAPI service has no fallback path at all — it returns 503 rather than
  substituting a rule-based answer. The card names the missing endpoint rather than showing a zero.
- **Feature importance:** *Not available*, with the reason that inventing a ranking from measured
  error would be a guess presented as a finding. Beside it, the feature contract that *does* exist:
  the 15 features read, the excluded ones with the trainer's own reasons, and the 13 accepted-but-
  ignored request fields.
- **Station-level error:** stated as unavailable at any granularity, with the reason.

The scatter is worth noting: predictions cluster in a 5–50 minute band while actual delays span
0–180, which is what an R² of 0.07 looks like. The page does not flatter the model.

### A Phase 3 regression, found and fixed here

`renderStaffDashboard` had replaced the old shared dashboard, and **staff lost the demo-data
controls** in Phase 3. Restored on both dashboards with their original server-side guards intact —
measured: staff see seed and refresh and no clear button; admin see all three.

### Verification — commands run and real results

| Check | Result |
|---|---|
| Admin portal at 1280 / 768 / 360 / 360+reduced-motion | **PASS** — 7 charts, 0 console errors, 0 page errors, no horizontal scroll, 1 live block + 1 historical block, no visible HTML entities, 0 reveal elements under reduced motion |
| Demo controls | staff: seed+refresh, no clear. admin: all three. Guards unchanged |
| All-role regression (4 + 6 + 7 pages) | **PASS** — 0 console errors, 0 page errors |
| PASSENGER fetching `/model/evaluation` from the browser | **403** |
| `npm test` (ML frontend) | 174 tests, 0 fail |
| `pytest -q` | **149 passed** (140 before + 9 new) |
| `cd backend && npm test` | 14/14 (untouched) |
| `cd frontend/frontend && npm run build` | pass, 498 ms (untouched) |
| `cd frontend/frontend && npm run lint` | **13 problems (11 errors, 2 warnings) — identical to the Phase 0 baseline** |
| greps: fabrication / hardcoded metrics / bare `Number(` | no matches |

### Note for Phase 5

**Full-page Playwright screenshots of very tall pages render charts incorrectly** — on an 8,741px
admin page the bar and scatter charts appeared crushed, while a direct DOM measurement showed correct
geometry (`gridX2=778`, 12 x-ticks) and per-element screenshots rendered perfectly. This misled me in
Phase 1 as well. **Phase 5 must capture per-element screenshots, or treat full-page captures as
indicative only.**

---

## Next: Phase 5 (verification and report) — not started

Rerun every baseline command with before/after output. Extend `scripts/ui_smoke.py` to log in as all
three roles, visit every changed route at 360/768/1280, assert zero console errors and no horizontal
scroll, capture screenshots into `reports/figures/ui/`, tab through each page and emulate
`prefers-reduced-motion`. State tests: degraded model (move `models/` aside), stale data, empty
history, API timeout, 401/403 handling, role isolation. Chart-data audit table. Final report.


---

## Phase 5 — verification and report (done)

Full report: **`docs/UI_FINAL_REPORT.md`**.

### Test tooling

- `scripts/ui_smoke.py` **extended** with `--sweep`: three roles × every route × 360/768/1280, plus a
  reduced-motion pass. Asserts rendered content, no console or page errors, no horizontal scroll, a
  reachable tab order, and an `aria-label` and source footer on every chart. Writes one screenshot
  per role/page/viewport.
- `scripts/state_checks.py` **new**: degraded model, stale data, empty history, request timeout,
  401/403 and the full role-isolation matrix.

### Two pre-existing problems in `ui_smoke.py`

1. Its default frontend was `127.0.0.1:3000`. Both that and `localhost:3000` are CORS-allowed, so
   this was not the cause of failure — but my first attempt to classify the failure used port 3001,
   which is *not* allowed, and the resulting CORS block made that evidence worthless. Re-tested on an
   allowed origin.
2. On an allowed origin the script **failed at step 2 against the unmodified Phase 0 frontend**
   (`git archive 381fa84`), waiting for `[data-action='predict']`. So it was already broken before
   this branch. My Phase 3 change also removed that selector from the staff/admin train page, so the
   step needed rewriting for the new information architecture regardless. Repaired: it now drives the
   fleet → drill-down → predict flow and passes for both staff and admin.

`wait_for_url` was additionally replaced with a hash poll, which is more robust for this router.

### Three real defects found by the sweep

1. **The fleet table pushed the whole page sideways at every viewport, including 1280.** The cause
   was not the table — `.table-wrap` scrolls it correctly. It was the visually-hidden
   `<span class="sr-only">` in the actions column header: `.sr-only` is `position: absolute`, and
   with no positioned ancestor its containing block is the initial containing block, so it escaped
   the wrapper's overflow clip, landed at the table's un-scrolled x position and extended
   `documentElement.scrollWidth` to 1341 on a 1280 viewport. Fixed by making `.table-wrap` a
   containing block, which fixes it for every visually-hidden element in any scrolling region.
   The wrapper also gained a tab stop and a label so sideways-scrolling content is keyboard-reachable.
2. **The admin dashboard named the active model version with no provenance**, so a reader there could
   not tell the model was synthetic-trained. It now carries the badge and a sentence saying a healthy
   service says nothing about accuracy.
3. **`state_checks.py` corrupted its own fixture** on the first run by calling `POST /demo/reset` as
   admin purely to observe a 200 — wiping the demo feed the later checks ran against, which then
   produced a spurious 404. Destructive endpoints are now proved by who is *refused*; the authorised
   call is deliberately skipped.

### Final results

```
ui_smoke.py --sweep      : 51 pages, 0 console errors, 0 page errors, 0 overflow,
                           33 charts, 0 missing aria, 0 missing source. ALL PASSED
ui_smoke.py --role admin : 13/13 PASS      --role staff : 13/13 PASS
state_checks.py (model loaded)  : ALL PASSED (1 skipped)
state_checks.py (model removed) : ALL PASSED (1 skipped)
pytest -q                : 149 passed        npm test (ML frontend) : 174 passed
backend npm test         : 14/14             React build            : passed
React lint               : 11 errors, 2 warnings — identical to the Phase 0 baseline
training metrics sha256  : 5b3b842f...a57d — identical to pre-change, after all five phases
CSS                      : original 1507 lines byte-identical; all additions appended
```

### Open decision for you

The sweep writes **51 screenshots, 3.7 MB, to `reports/figures/ui/`**, as the brief asked. They are
currently **untracked**. `reports/figures/` is a tracked directory, so they will keep appearing in
`git status` until either committed or ignored. Proposed second `.gitignore` line, **not applied**:

```diff
 reports/evaluation.json
+
+# Sweep screenshots, regenerated by scripts/ui_smoke.py --sweep.
+reports/figures/ui/
```

It would exclude only that directory; the five tracked figures in `reports/figures/` are unaffected.
Say which you prefer — commit them as evidence, or ignore them as regenerable output.
