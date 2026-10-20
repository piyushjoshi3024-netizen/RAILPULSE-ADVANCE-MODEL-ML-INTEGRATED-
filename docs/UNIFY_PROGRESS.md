# RailPulse unification — progress log

## Session 1 (2026-10-20): read-only analysis ("first analyse the whole website properly")

No phase was named, so **no code was changed**. This pass is static analysis plus a
read-only MongoDB/Docker inventory. No builds, no installs, no Playwright, no writes
to any database.

### Done
- Full file-tree inventory of all four apps.
- Read: React `App.jsx`, `AuthContext`, `ProtectedRoute`, `RoleRoute`, layout
  (`Sidebar`/`Header`/`MainLayout`), `Login`, `Register`, `StaffRegister`, `StaffOTP`,
  `Dashboard`, all `services/*.js`.
- Read: Node `app.js`, `server.js`, `config/db.js`, `config/redis.js`,
  `middleware/auth.js`, `middleware/rbac.js`, every `routes/*.js`, `auth.controller`,
  `auth.service`, `staffAuth.controller`, `otp.service`, `alert.service`, `Alert`,
  `User`, `liveState.service`, `mlEta.service`, `eta.controller`.
- Read: FastAPI `core/config.py`, `core/security.py`, `main.py`, `api/routes/auth.py`,
  `api/dependencies.py`, `db/mongodb.py`, `db/repositories/{base,user_repository}.py`,
  endpoint/role map for every route module.
- Read: ML frontend `config.js`, `api.js`, `state.js`, `app.js` (all 332 lines),
  `pages/passenger.js` (pages + journey loader), `index.html`, CSS media queries.
- Read-only Docker + Mongo inventory (`docker ps`, `listDatabases`, per-collection
  counts and indexes).

### Commands run and real output (abridged)
- `docker ps --format '{{.Names}}\t{{.Ports}}'`
  - `railpulse-mongo-dev` — **no published ports**
  - `railpulse-redis` — `0.0.0.0:6379->6379`
  - `railpulse-mongo` — `0.0.0.0:27017->27017`
- `docker exec railpulse-mongo mongosh --eval listDatabases` → `admin, config, local, railpulse, railpulse_node`
- `docker exec railpulse-mongo-dev mongosh --eval listDatabases` → `admin, config, local, railpulse, railpulse_eta_ml`
- Collection inventory, reachable server (`railpulse-mongo`, port 27017):
  - **railpulse** (FastAPI/ML shape): `alerts` 0, `live_train_state` 16, `predictions` 135,
    `reference_trains` 12, `simulation_states` 6, `users` 18
  - **railpulse_node** (Node/Mongoose shape): `alerts` 0, `bottlenecks` 0, `etapredictions` 1,
    `journeys` 1, `propagations` 0, `recoveries` 0, `riskassessments` 0, `simulations` 0,
    `trainevents` 1, `trains` 1, `users` 1 (indexes `email_1`, `employeeId_1`)
  - On the **unreachable** `railpulse-mongo-dev`: `railpulse` (Node shape, 5 trains,
    3 alerts, 1 user) and `railpulse_eta_ml` (ML shape, all empty except 2 users)
- `mongosh` is **not installed on the host**; all Mongo reads went through `docker exec`.
- `git ls-files | grep env` → only `prediction model/railpulse-backend/.env.example`
  is tracked. Both real `.env` files are untracked/ignored.

### Decisions / corrections to the brief (verified in code, trust these over the brief)
1. **Database names in the brief are wrong.** Node `MONGO_URI=.../railpulse_node`;
   FastAPI `MONGODB_DB=railpulse`. So the ML database is literally named `railpulse`,
   and `railpulse_eta_ml` only exists on the unreachable dev container. G1's default
   target must be restated as **`railpulse` on `railpulse-mongo` (port 27017)**.
2. **Two Mongo containers are running.** `railpulse-mongo-dev` publishes no ports, so
   nothing can reach it; its data is stale. It is a cleanup candidate, not a data source.
3. **The passenger dashboard to change is `renderPassengerDashboard` in
   `js/pages/passenger.js`, not `passengerDashboard()` in `app.js`.** The whole
   `renderDashboard`/`passengerDashboard`/`operationalDashboard` chain in `app.js`
   (and `renderTrain`/`renderHistory`/`renderAlerts`/`renderSystem`/`renderNotFound`)
   is unreachable for PASSENGER, STAFF and ADMIN alike — `renderPage` handles all
   three roles above the fallbacks. The "LIVE SIGNAL" badge and the welcome hero live
   only in that dead code, so a passenger sees **no** hero today, just a duplicate of
   the Track page.
4. Exception to (3): unknown pages **do** reach some fallbacks, which is a role leak —
   `#/passenger/simulation` renders the staff simulation form. See A-07.
5. No Node controller reads `req.user` (grep-confirmed, only `auth.controller.getMe`),
   so the identity swap stays low-coupling, as the brief said.

### Next (awaiting the user)
- Phase 1 (passenger welcome page) — scope corrected per item 3 above.
- Phase 2 baseline (`npm ci`, `npm run build`, `npm run lint`, `npm test`,
  `pip install`, `pytest -q`) **not run**: `npm ci` / `pip install` install
  dependencies, which the brief requires approval for.
- G1–G6 answers, and which audit IDs are approved.

---

## Session 2 (2026-10-20): Phase 1 — passenger welcome page

Branch: `feature/unified-auth-db` (created off `feature/ml-dashboards`).

### Done
- `js/pages/passenger.js`: `renderPassengerDashboard` is now a welcome page.
  Greeting + IST date eyebrow, "Welcome to RailPulse, <name>." headline, one
  honest sentence (model estimate with a range, not a guarantee, not tracked
  live), a neutral right-hand note ("Arrival estimates · not live tracking"),
  three link cards (Track a train / Prediction history / Alerts) and one
  primary button to `#/passenger/train`. It makes **no API call** and prints
  no number. The quick-lookup form and the "No train selected" panel are gone
  from the dashboard; both still exist on the Track and History pages, which
  are untouched.
- `js/app.js`: one line — `pageTitle('dashboard')` reads "Welcome" for
  PASSENGER and still "Command overview" for STAFF and ADMIN. Nothing else in
  app.js changed; `operationalDashboard`, `demoEnvironmentPanel` and the
  staff/admin pages are untouched.
- `css/style.css`: one rule added inside the existing `max-width:900px` block
  stacking `.welcome`. Without it the right-hand note overlapped the lede at
  768 px (seen in the browser before the fix). No tokens changed, no new
  classes, `.page-intro`/`.train-header` unaffected.
- `tests/passenger-dashboard.test.js`: 9 new tests. `fetch` is stubbed to
  throw, so a future regression that calls the API from this page fails the
  suite. Covers name fallback, HTML escaping, the honesty sentence, the exact
  set of link targets, one primary CTA, absence of the lookup form / "No train
  selected" / "LIVE SIGNAL" / metric markup, and that `reveal` is kept.

### Commands run and real output
- `node --check js/pages/passenger.js` → clean; `node --check js/app.js` → clean
- `node --test tests/` → **183 tests, 183 pass, 0 fail** (was 174 before; the
  9 new ones are the difference)
- `node --test tests/passenger-dashboard.test.js` → **9 pass, 0 fail**
- Browser (built-in pane, real servers already running on :3000/:8000):
  - 1280×900 — no horizontal scroll (`scrollWidth == clientWidth == 1280`),
    three cards in one row, topbar reads "Welcome", health pill
    "FastAPI connected"
  - 768×1024 — no horizontal scroll, hero stacked, cards 2+1
  - 360×800 — no horizontal scroll (`scrollWidth == 360`), everything stacked
  - Focusable elements inside `#page-content`, in order:
    `#/passenger/train`, `#/passenger/history`, `#/passenger/alerts`,
    `#/passenger/train` — no other targets, all four exist as routes
  - Tab from the top reaches the sidebar first and shows a visible focus ring
    (`outline-width: 2.03px`)
  - `read_console_messages` → **no console logs** (no errors, no warnings)

### Notes and gotchas for the next session
- `python3 -m http.server` on :3000 sends no `Cache-Control`, and the browser
  served the old modules for several reloads. Verification was done against a
  second, no-store server on :3100 (started and stopped within the session),
  then the :3000 cache was refreshed with `fetch(..., {cache:'reload'})`.
  On :3100 the health pill reads "FastAPI offline" — that is CORS, not a bug:
  `CORS_ORIGINS` lists `http://localhost:3000` only.
- A session was injected into `sessionStorage` to render the dashboard, which
  needs no token because it calls nothing.

### Not done in Phase 1 (blocked, needs the user)
- **"A PASSENGER can run a prediction end to end" was not executed.** No usable
  passenger credential exists: `ui_smoke.py` and `state_checks.py` generate
  random passwords per run, and `ritik` / `ayushi` / `uitest_passenger`
  passwords are unknown. Creating a throwaway account is a **database write**,
  which needs explicit approval. The Track page was verified by reading the
  code instead: `renderPassengerTrain` → `lookupPanel` + `loadJourney` +
  `loadTrainChoices`, and `loadJourney` renders state, route, the P10–P90
  arrival window (`arrivalPanel`), the synthetic-data badge and the
  beats-baseline sentence (`provenanceFooter`). None of that code was modified.

### Observation (not fixed)
- The literal string `LIVE<br>SIGNAL` still exists at `js/app.js:159`, inside
  `renderDashboard`, which is **unreachable** for all three roles (see Session
  1, correction 3). Removing it means deleting dead code, which needs
  approval, and its STAFF/ADMIN branch is out of Phase 1 scope.

---

## Session 3 (2026-10-20): Phase 2 — audit and plan (read-only)

Full report: `docs/AUDIT_PHASE2.md`. Screenshots and raw sweep data:
`prediction model/railpulse-backend/reports/figures/audit/` (18 PNGs +
`audit_pass.json`). No application code, config or data was changed.

### Baseline, real results
- `npm run build` (React) — passed, 2010 modules, 570 ms, one 580 kB chunk warning
- `npm run lint` (React) — **13 problems (11 errors, 2 warnings), all pre-existing**
- `npm test` (Node) — 14/14 passed
- `pytest -q` (FastAPI, `.venv/bin/python`) — 149 passed, 3 deprecation warnings
- `node --test tests/` (ML frontend) — 183/183 passed
- `npm ci` and `pip install` were **not run**: installing needs approval and both
  environments were already present and working.

### New findings beyond Session 1
- **A-20 (high):** `GET /api/alerts/:trainId` *writes*. It calls
  `alertService.generateAlert`, which inserts an Alert and broadcasts over
  Socket.IO. Unauthenticated.
- **A-22 (high):** `Simulation.jsx` scenarios 2 and 3 post train ids that do not
  exist. `railpulse_node.trains` has exactly one document, `6a9d5a64…` (12951).
  Both scenarios always fail, silently.
- **A-23 (medium):** `CommandCenter.jsx` pins risk/bottleneck/propagation/recovery
  to that same hardcoded id in four separate effects.
- **A-21 (medium):** `Alerts.jsx` hardcodes the same id and renders one alert; its
  five-entry mock array is dead.
- **A-24, A-25 (low):** dead service function `runPassengerSimulation`; 580 kB bundle.

### Measured, not inferred
- No-auth probes: `GET /api/trains` 200, `/api/train-events` 200, `/api/alerts` 200,
  `/api/operations/network` 200, `/api/trains/:id/eta` **401**. FastAPI: `/trains`
  and `/alerts` **401**, `/health/` 200.
- `POST /api/auth/staff/send-otp` → **404 HTML**; `POST /api/staff-auth/send-otp` → **400**.
- Playwright anonymous sweep at 360/768/1280: **zero console errors, zero page
  errors, no horizontal scroll** on every page reached; anonymous redirects correct
  in both apps.

### Still blocked
No usable credential for either app (random per-run passwords in the smoke scripts;
one unreadable bcrypt hash in `railpulse_node`). The role sweep, the authenticated
responsive check (A-09), keyboard tab-through of the signed-in shell, and the
end-to-end prediction all remain **not run**.

### Next
Waiting on: G1 (target `railpulse`; copy-5-docs or start-fresh), G2, G3 (S1/S2/S3),
G4, G5, G6, the approved audit IDs for Phase 3, and a credential or permission to
create one test passenger.

### Phase 2 addendum — decisions received, authenticated sweep run

Decisions: **credential** = create one test passenger (approved); **G1** = target
`railpulse`, **start fresh** (leave `railpulse_node` untouched as the backup);
**G3** = **S1** (staff seeded or admin-created, OTP pages hidden, code kept);
**G4** = **URL fragment** handoff. Still open: G2, G5, G6, and the audit IDs.

Created `phase2_passenger` (PASSENGER) via `POST /api/v1/auth/register` → 201;
`railpulse.users` 18 → 19. Password kept out of the repo (session scratchpad only).

Authenticated results (added to `docs/AUDIT_PHASE2.md`):
- Dashboard / Track / History / Alerts at 1280, 768, 360: **no horizontal scroll,
  0 console errors, 0 page errors** on all twelve combinations.
- **End-to-end prediction works** for a PASSENGER on train 12002: P10–P90 range
  (+1.4 to +26.4 min), 44% chance of >15 min late, synthetic notice, 2 charts.
  The beats-baseline warning correctly stays hidden because `/health/` reports
  `beats_baseline: true` (MAE 21.8 vs baseline 24.7).
- **A-07 confirmed live**: `#/passenger/simulation` serves the staff simulation
  form and the SIMULATION MODE badge to a PASSENGER.
- Keyboard order in the signed-in shell is correct (brand → nav → sign out → page).

Remaining verification gap: **A-09** (React fixed `w-64` sidebar at 360 px) still
needs a *main-site* account, which the approval did not cover.

---

## Session 4 (2026-10-20): Phase 3 — approved audit fixes

Eleven IDs fixed, one commit per ID or close group, on `feature/unified-auth-db`.
No drive-by refactors. Deliberately **not** touched: A-20 (server side of the
GET that writes), A-08/G6 (route protection), A-02/A-14/A-17 and everything the
open gates or Phase 6 cover.

| ID | Commit | What changed |
|---|---|---|
| A-06 | `2639199` | `middleware/auth.js` no longer logs secret presence, header presence or the decoded JWT; `server.js` drops the secret-loaded line; `otp.service.js` drops the sender/recipient logs |
| A-03, A-04 | `0b68566` | `/` is now an `Entry` component redirecting by auth state; sidebar "Dashboard" → `/dashboard`; `RoleRoute` → `/dashboard`; a `*` route inside the shell |
| A-05 | `57de353` | `getMe` reads the user from the database (`authService.getUserById`) instead of echoing the token payload |
| A-07 | `4168601` | ML `renderPage` gates the generic fallbacks by role |
| A-12 | `ddc24c3` | "View Map" navigates to `/map`; the `InsightCard` button with no destination is gone |
| A-13 | `52df653` | `StaffOTP` handles a missing address and names the one it has |
| A-21 | `0c7e90b` | Alerts reads `GET /api/alerts` instead of the generating per-train route; mock array deleted; loading and error states rendered |
| A-23 | `f015648` | Command Center carries `trainId` through and the four operations panels follow the selection |
| A-22 | `22ffc32` | Simulation loads real trains, adds a train picker, reports failures, disables the button when there is nothing to run |
| A-01 | `7d37a4a` | Staff OTP calls point at `/api/staff-auth/*`; a shared helper checks the content type before parsing |

### Verification, real output
- React build — passed every time (last: 471 ms)
- React lint — **11 problems (9 errors, 2 warnings)**, down from 13: the two
  unused-variable errors in `Alerts.jsx` are gone. No new problems introduced.
- Node `npm test` — 14/14; ML frontend `node --test` — 183/183;
  `pytest -q` — 149 passed
- Playwright, anonymous, React: `/` → `/login`, `/dashboard` → `/login`,
  `/no-such-page` → `/login`, `/register`, `/register/staff` and
  `/staff/verify-otp` render. **No page errors, no console errors.**
- Playwright, signed in as the test passenger, ML app: `#/passenger/simulation`,
  `#/passenger/capabilities` and `#/passenger/system` all render "This route has
  not been laid yet"; dashboard, train, history and alerts unchanged. No page errors.

### Not verified at runtime
- **A-05 and A-06** are Node changes, and the running Node server (pid 239903,
  started with `node`, no watcher) still has the old code. Syntax-checked and the
  suite passes; the behaviour needs a server restart, which is the user's process.
- **A-04's not-found page** and **A-03's signed-in half** sit behind a main-site
  login, which this session still does not have.
- **A-12, A-21, A-22, A-23** are all behind the same login. Build and lint pass.

### New observations (not fixed, not approved)
- `train.controller.js:31` and `trainEvent.controller.js:35` still `console.log`
  whole request bodies. Not credentials, so outside A-06's scope.
- `Alerts.jsx` "Resolve"/"Reopen" only changes local React state. There is no
  endpoint to persist it, so the status resets on reload.
- `services/alertService.js` is now unused — it was the only caller of the
  writing route. Deleting a file needs approval.

---

## Session 5 (2026-10-20): Phase 4 — unified authentication

G2 taken as answered by the instruction to run Phase 4, with the cost restated:
**existing main-site accounts do not survive**. Commits `32503b7` (Node) and
`a4a000c` (React + ML app).

### Order followed
1. **Tests first.** `backend/tests/auth.middleware.test.js`, 13 cases. Five
   failed against the old middleware (it accepted a token with no subject, no
   role, a role of `SUPERUSER`, and the legacy `userId` shape).
2. **Env.** Node's `JWT_SECRET` set to FastAPI's existing `JWT_SECRET_KEY`
   (51 characters, reused so live ML sessions survived; never printed).
   `CORS_ORIGINS` gained `http://localhost:5173` and `http://127.0.0.1:5173`,
   additive. `.env.example` documents the sharing with placeholders only.
   Both `.env` files backed up to `backups/20261020T203354/` first; `backups/`
   is gitignored.
3. **Node `authenticate`** rewritten as a verifier: `algorithms: ["HS256"]`,
   non-empty `sub` required, role must be one of the three known ones, nothing
   logged or echoed. 27/27 backend tests pass.
4. **FastAPI CORS** — the only FastAPI change. `/openapi.json` diffed before and
   after: **23 paths before, 23 after, schemas byte-identical**.
5. **React** — new `services/authApi.js` for identity, `services/api.js` still
   Node for data, one token under one key. Login takes a username; Register
   takes username + optional full name and posts FastAPI's contract.
   `AuthContext` reads FastAPI's `/auth/me` shape.
6. **G3 / S1** — the registration page no longer offers staff signup and says
   administrators create those accounts. Staff pages and OTP code stay in the
   tree.
7. **G4** — the sidebar builds `#/sso?token=…` at click time (never in the DOM);
   the ML app strips the fragment before using the token and validates it with
   `/auth/me`.

### Proof script: 21 checks, 21 passed, 0 failed
Token rules: FastAPI registers and logs in; Node accepts the FastAPI token on
the ETA route (200) and refuses no token, an edited role, and `alg:none` (401);
FastAPI refuses the same edited token; a PASSENGER is refused on
`/network/.../delay-propagation` and `/simulation/update` (**403**); Node
`/auth/me` reports the FastAPI identity.
Browser: register through the React form → login → dashboard → one stored token
→ the ML app opens already signed in at `#/passenger/dashboard` with **no token
left in the address** → main-site logout clears the token and `/dashboard`
closes again → ML sign-out returns to its login → a forged handoff token signs
nobody in. No page errors anywhere.

Screenshots `proof-01`…`proof-05` in `reports/figures/audit/`.

### Phase 3 items verified now that signing in is possible
- **A-09 confirmed, still open:** at 360 px the signed-in site scrolls
  horizontally on every page — body `scrollWidth` 513 px in a 360 px viewport,
  with the sidebar fixed at 256 px. Clean at 768 and 1280.
- A-03: sidebar targets are `/dashboard` …; `/operations` and `/simulation` as a
  PASSENGER redirect to `/dashboard`, and both are hidden from the sidebar.
- A-04: `/no-such-page` stays put and renders "Page not found" inside the shell.
- A-21: the Alerts page shows a real state and the mock entries are gone.
- Zero console errors and zero page errors across 21 signed-in page loads.

### Suites after Phase 4
React build passed · React lint **11 problems (9 errors, 2 warnings)**, unchanged
· Node **27/27** · ML frontend **183/183** · pytest **150 passed** (149 before:
the contract test parametrises over every `api.*()` call in the ML frontend, so
the handoff's `GET /auth/me` added one case, and it passes).

### Processes
`uvicorn` was restarted by me and now runs detached from the user's terminal,
logging to the session scratchpad. The Node server runs under **nodemon**, which
had already reloaded it; the nodemon parent was left alone.

### Open
G5 (keep Redis), G6 (route protection), A-20, A-02/A-14/A-17, and Phase 5–7.

---

## Session 6 (2026-10-20): ML frontend chart integration — verification

Phase 5 not started. No database, container, volume or Redis change. **No
application code was changed in this session**: the work asked for was already
in the tree, and the honest deliverable is the evidence, not a rewrite.

### 1. The four modules are already connected

| Module | How it reaches the UI |
|---|---|
| `format.js` | imported by `ui.js`, `chart-core.js`, `charts.js` and all four page modules |
| `chart-core.js` | imported by `charts.js` (scales, ticks, paths, downsampling, histogram, table and summary builders) and directly by `pages/admin.js` (`histogram`) and `pages/staff.js` (`bandFor`) |
| `charts.js` | `renderChart` imported by `pages/passenger.js`, `pages/staff.js`, `pages/admin.js`, `pages/operations.js` |
| `ui.js` | panels, badges, empty/error/not-available states across every page |

**15 `renderChart` call sites** and 16 declared mounts. Every `chart-core`
export is consumed by `charts.js`; none is dead.

### 2. Field mappings, checked against live payloads

- `POST /predict/eta` returns `delay_p10_minutes`, `delay_p50_minutes`,
  `delay_p90_minutes` **and** `predicted_delay_minutes`. Measured on train 12002:
  `predicted_delay_minutes = delay_p50_minutes = 6.921782546274498`, p10 1.366,
  p90 26.362. They are the same number by construction —
  `app/ml/predictor.py:99-101` assigns `predicted_delay_minutes=p50` and
  `delay_p50_minutes=p50`, and the schema documents the former as "P50 (median)".
  The passenger interval chart's use of `predicted_delay_minutes` as the median
  between p10 and p90 is therefore correct, not an approximation.
- **Stored history rows have no `delay_p50_minutes`** (confirmed absent in
  `GET /trains/12002/predictions`). `pages/passenger.js` already says so in a
  comment and uses `predicted_delay_minutes`, with p10/p90 for the band.
- `GET /model/evaluation` returns **111 real held-out rows** with
  `p10 / p50 / p90 / actual_delay_minutes / residual_minutes / journey_date /
  train_number / run_frequency / season`. The admin scatter, residual histogram
  and by-date trend read exactly those fields.
- The admin calibration chart's rendered table matched the API byte for byte:
  45%/30%, 63%/64%, 82%/81% against `mean_predicted` 0.4490 / 0.6331 / 0.8215
  and `observed_rate` 0.30 / 0.64 / 0.8077.

### 3. Every mount draws, from real data

Signed in as PASSENGER, STAFF and ADMIN at 1280, 768 and 360 (51 page loads):

| Chart | Page | Series | Marks | Accessible name |
|---|---|---|---|---|
| `arrival-interval-chart` | passenger train | 1 | 3 | "How late, and how uncertain…" |
| `history-sparkline` | passenger train/history | 1 | 49–51 | "Predicted delay, earlier runs… 46–48 points" |
| `band-chart` | staff dashboard | 1 | 6 | "Predicted delay band… 5 points" |
| `fleet-delay-chart` | staff dashboard | 1 | 8 | "Latest predicted delay by train… 7 points" |
| `fleet-trend` | staff/admin history | 5 | 122 | "Predicted delay across successive runs… 50 points" |
| `detail-trend` | staff train detail | 1 | 53 | "Predicted delay for train 12002… 50 points" |
| `baseline-chart` | admin system | 1 | 4 | "Mean absolute error on the held-out split… 3 points" |
| `coverage-chart` | admin system | — | 3 | "Measured interval coverage against its target" |
| `segment-chart` | admin system | 2 | 25 | "Error and bias by train… 12 points each" |
| `calibration-chart` | admin system | 1 | 4 | "Predicted probability against observed rate… 3 points" |
| `scatter-chart` | admin system | 1 | 112 | "Predicted delay against actual delay… 111 points" |
| `residual-chart` | admin system | 1 | 17 | "Residuals: predicted minus actual… 111 points" |
| `historical-trend` | admin system | 1 | 2 | "Absolute error by journey date… 111 points" |

**No empty mounts. No horizontal scroll at 360, 768 or 1280 on any page for any
role. Zero console errors and zero page errors across the whole sweep.** Every
chart carries an aria-label built from the drawn data and a "View as table"
toggle whose numbers match the API.

A first pass appeared to show `segment-chart` drawing almost nothing. That was
my instrument, not the product: a legend swatch is also an `<svg>`, so
`querySelector('svg')` measured the swatch on every multi-series chart. Reading
`svg.chart-svg` showed 25 marks and the correct label.

### 4. Missing and partial data

- `99999`, a train that does not exist: **0 charts, 0 marks**, and the page says
  "Train 99999 is not in the…". Nothing is drawn.
- `12229`, a live train with **0 stored predictions** (confirmed via the API):
  the history panel falls back to `emptyState('No earlier predictions', …)`.
- Guards verified in source: `if (!evalData) return`, `if (!rows.length) return`,
  `finite(intervals.coverage) !== null`, `Array.isArray(curve) && curve.length`,
  and `.filter(point => point.x !== null && point.y !== null)` on the scatter.
  Admin feature importance renders `notAvailable(...)` rather than inventing a
  ranking from measured error.

### 5. Commands and results

| Command | Result |
|---|---|
| `node --test tests/` (ML frontend) | **183 passed, 0 failed** — chart-core 49, format 50, ui 63, operations 12, passenger-dashboard 9 |
| `npm test` (backend) | 27 passed, 0 failed |
| `pytest -q` | 150 passed |
| Playwright chart sweep, 3 roles × 3 widths | 51 page loads, 0 console errors, 0 page errors, 0 horizontal scroll |

### 6. Files changed

No source file changed. Added: `reports/figures/audit/charts-*.png` (13
screenshots), `chart_audit.json`. The sweep scripts live in the session
scratchpad, not the repository.

### 7. Limitations and disclosures

- **This verification wrote prediction rows.** Exercising the Track page asks
  the model for a prediction, and the backend persists every prediction. The
  `predictions` collection went from 135 at the Phase 2 inventory to **150**;
  roughly 13–14 of those rows come from this session's sweeps. No other
  collection changed: `users` 23, `live_train_state` 16, `simulation_states` 6,
  `alerts` 0, all unchanged this session. No schema, index, container or volume
  was touched.
- **`scenario-chart` (staff simulation) is verified by reading, not running.**
  `runScenarioComparison` posts `/predict/eta` several times and has its own
  "acknowledge the write" checkbox, so running it would write more rows than a
  verification should. Its mount and mapping were checked in source only.
- The admin scatter plots p50 against actual and does not draw the p10–p90
  interval the evaluation rows also carry. That is a design choice, not a
  mapping error; showing whether each actual fell inside its interval would be
  new work.
- `charts.js` itself has no unit test — the suite covers `chart-core`'s pure
  helpers, and the DOM layer is covered only by this browser sweep.
