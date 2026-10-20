# RailPulse ML dashboards — UI progress log

Resume point for a fresh session. One phase per message; do not start the next phase unprompted.

- Branch: `feature/ml-dashboards` (created from `feature/real-data-ml` @ `381fa84`)
- Scratch dir (not committed): `/tmp/claude-1000/-home-ritik-Desktop-RAILPULSE-ADVANCE-MODEL-ML-INTEGRATED-/0e8d691c-1dc1-45d6-9435-d07e942d7053/scratchpad`
  - `metrics_before.json`, `metadata_run1.json`, `metadata_run2.json`, `fixtures/*.json` (real API responses), `openapi_before.json`
- Last updated: 2026-10-20 — end of Phase 0

---

## Status

| Phase | State |
|---|---|
| 0 Inspect, baseline, plan | **Done — awaiting approval of gates D1–D4 + one open question** |
| 1 Foundations | Not started |
| 2 Passenger | Not started |
| 3 Staff | Not started |
| 4 Admin + D3 | Not started |
| 5 Verification + report | Not started |

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
