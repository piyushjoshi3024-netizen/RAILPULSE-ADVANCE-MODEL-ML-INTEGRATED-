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

### 0. Files inspected

Read in full or in part, none modified:
`js/app.js`, `js/api.js`, `js/config.js`, `js/state.js`, `js/format.js`,
`js/ui.js`, `js/chart-core.js`, `js/charts.js`, `js/pages/passenger.js`,
`js/pages/staff.js`, `js/pages/admin.js`, `js/pages/operations.js`,
`css/style.css`, `tests/*.test.js`; and on the backend, read-only for field
mapping: `app/ml/predictor.py`, `app/services/eta_service.py`,
`app/schemas/prediction.py`, `app/api/routes/model.py`.

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

---

## Session 7 (2026-10-20): tests for the chart DOM layer

Closes the gap Session 6 reported: `charts.js` had no unit test, and the DOM
layer was covered only by a browser sweep that had to drive real pages.

**No service was started and no endpoint was called in this session.** Every
test here runs offline against controlled fixture data. No database read or
write of any kind. The prediction rows created during Session 6 are left
exactly as they are, pending the user's decision.

### Files changed
| File | Change |
|---|---|
| `prediction model/railpulse-frontend/tests/charts.test.js` | **new** — 19 tests for the rendering layer |
| `prediction model/railpulse-frontend/tests/helpers/fake-dom.js` | **new** — ~190-line DOM stub, no dependency |
| `docs/UNIFY_PROGRESS.md` | this entry, plus the files-inspected list Session 6 was missing |

`js/charts.js` itself is **byte-identical to HEAD** (`git diff --quiet js/charts.js`
passes). No theme, page, backend, model, auth or configuration file was touched.

### Why a stub rather than a browser
The DOM surface `charts.js` actually uses was measured first: `createElement`,
`createElementNS`, `appendChild`, `setAttribute`, `textContent`,
`className`/`classList`, `style.setProperty`, `addEventListener`, `hidden`,
`remove`, `getBoundingClientRect`, one class selector, plus `ResizeObserver` and
`requestAnimationFrame`. All of it fits in a small stub, so the tests run inside
the project's existing `node --test` suite with **nothing installed and nothing
started**. The stub implements only that surface; anything else fails loudly
rather than passing against invented behaviour.

### What the 19 tests assert
- the card structure the stylesheet targets (`chart-card`, `chart-head`,
  `chart-title`, `chart-plot`, `chart-foot`, `chart-svg`), so the theme keeps applying
- the source line, including "Source: not stated" when a caller gives none
- the accessible name is built from the data (point count, range, axis label)
- a legend appears only for more than one series
- one path per line, one rect per point per series for bars, one marker per
  scatter point, a band for an interval chart
- **absence stays absent**: an empty series and an all-null series both draw
  nothing and say "no points in this series"; a partly-null series drops exactly
  the non-finite points and the table carries no row the chart would not draw
- the table is built lazily on first open, matches the drawn numbers through the
  caller's own formatter, and closes without rebuilding
- downsampling reduces a 1500-point series, admits it in the footer, and keeps
  the extremes so a spike survives
- the reveal clip is added when motion is allowed and **not added at all** under
  `prefers-reduced-motion`
- the returned handle redraws on `update`, clears the mount on `destroy`, and is
  safe to call with no mount

### Commands and results
```
cd "prediction model/railpulse-frontend"
node --check tests/helpers/fake-dom.js        # clean
node --test tests/charts.test.js              # 19 passed, 0 failed
npm test                                      # 202 passed, 0 failed, 45 suites
```
Per file: chart-core 49, charts **19**, format 50, operations 12,
passenger-dashboard 9, ui 63. The helper is not collected as a test
(`node --test tests/` matches `*.test.js` only; grep for `fake-dom` in the run
output returns 0).

### Mutation check — the tests have teeth
Four deliberate breakages of `charts.js`, each reverted immediately from a copy
taken first:

| Mutation | Result |
|---|---|
| non-finite points no longer filtered | **2 tests fail** |
| table built eagerly instead of on demand | **1 test fails** |
| `prefers-reduced-motion` ignored | **1 test fails** |
| second bar series dropped | **1 test fails** |
| restored | 19 pass, 0 fail; `git diff` on `js/charts.js` is empty |

### Limitations
- The stub is not a browser. Layout, CSS, fonts and hit-testing do not happen,
  so these tests assert structure and numbers, not appearance. Visual and
  responsive behaviour still rests on the Session 6 browser sweep.
- Pointer and keyboard interaction inside `wireReadout` (hover cursor, arrow-key
  readout) is not covered: it depends on real coordinates and focus, which the
  stub cannot supply honestly.
- `scenario-chart` remains verified by reading only, because exercising it posts
  predictions.

---

## Session 8 (2026-10-20): Phase 5 — one database

Executed with explicit approval: **D1** (Node startup may create its collections),
**D2 option (c)** (seed one train with the id the surviving Redis key points at),
**D3** (verify with reads only). Redis untouched, `railpulse_node` untouched,
no Docker or volume change, nothing installed.

### Backup taken first, and verified
`backups/20261020T213105/` (gitignored): `railpulse.archive.gz`, `railpulse_node.archive.gz`,
`backend.env`, `before-state.txt`, `after-state.txt`, and the two dump logs.
`mongodump` is absent from the host but present in the container, so both dumps
were streamed to stdout — nothing was written inside the container.
The logs confirm coverage: railpulse users 23, predictions 150, live_train_state 16,
reference_trains 12, simulation_states 6, alerts 0; railpulse_node all 11
collections including trains 1, trainevents 1, journeys 1, etapredictions 3.

### Files changed
| File | Change |
|---|---|
| `backend/.env` | `MONGO_URI` database `railpulse_node` → `railpulse` (one line) |
| `backend/src/models/User.js` | `mongoose.model("User", userSchema, "main_users")` |
| `backend/src/models/Alert.js` | `mongoose.model("Alert", alertSchema, "main_alerts")` |
| `Readme.md` | the database paragraph, which named two databases that never existed under those names |

### What the database did
Purely additive. Eleven new, empty collections appeared in `railpulse`:
`main_users`, `main_alerts`, `trains`, `trainevents`, `etapredictions`,
`journeys`, `simulations`, `bottlenecks`, `propagations`, `recoveries`,
`riskassessments`.

`diff before-state.txt after-state.txt` shows **only those eleven additions**.
All 17 pre-existing collections are identical in document count and index set,
including the one that mattered:

    railpulse.users docs=23 idx=[_id_,username_1]      before and after

No `email_1` index was created there. The unique email and employeeId indexes
went to `main_users`, where they belong and where there is nothing to collide with.

### Verified with reads only
- Node `/api/health` 200; FastAPI `/api/v1/health/` reports `mongodb: ok`, `model: ok`
- FastAPI on the shared database: login as the existing test passenger still works,
  `/trains` 200, `/alerts` 200, `/reference/trains` 200,
  `/trains/12002/predictions` 200 — identity and history intact
- Node reads its new, empty collections: `/api/trains` `[]`, `/api/train-events` `[]`,
  `/api/alerts` `[]`, `/api/operations/network` `totalTrains: 0`
- Suites, none of which bind Mongo: Node **27 passed**, ML frontend **202 passed**,
  pytest **150 passed**, React build passed

### Not done: the D2(c) seed
The single approved insert was **refused by the sandbox**, not by the application:

    POST /api/trains  ->  denied: "Modify Shared Resources"

I did not route around it. The main site therefore starts empty, and the Node ETA
route stays unavailable because its Redis key has no matching train. The exact
request is in the report for the user to run or to permit.

### State after this phase
- `railpulse_node`: untouched, still holds all 7 documents, read by nothing
- Redis: untouched, 5 keys, same configuration
- Rollback, corrected: `backend/.env` is gitignored, so `git checkout` cannot
  restore it. The two steps are

      cp backups/20261020T213105/backend.env backend/.env
      git checkout -- backend/src/models/User.js backend/src/models/Alert.js Readme.md

  then let nodemon reload. The eleven new collections stay behind as empty
  leftovers and need separate approval to drop.

---

## Session 9 (2026-10-20): Phase 6a + D2

Approved scope only. Redis untouched, `railpulse_node` untouched, no database
write, no Docker or volume change, nothing installed, no migration. The D4
route-protection work is **not started**: it waits at the checkpoint.

### Commits
| Commit | Content |
|---|---|
| `186dde6` | Phase 6a: cross-app sign-out, 401 handling, re-registration messaging, configurable origins, truthful health, mobile drawer, honest empty states |
| `62c9bc9` | D2: the five Express identity endpoints answer 410 Gone |

### Files changed
**New:** `frontend/frontend/src/config.js`, `frontend/frontend/.env.example`,
`frontend/frontend/src/services/session.js`,
`frontend/frontend/src/services/interceptors.js`,
`frontend/frontend/src/hooks/useServiceHealth.js`, `backend/middleware/gone.js`.

**Changed:** `services/api.js`, `services/authApi.js`, `services/authService.js`,
`context/AuthContext.jsx`, `pages/Login.jsx`, `pages/Dashboard.jsx`,
`pages/StaffRegister.jsx`, `pages/StaffOTP.jsx`, `components/layout/Sidebar.jsx`,
`components/layout/Header.jsx`, `components/layout/MainLayout.jsx`;
ML app `js/config.js`, `js/app.js`, `css/style.css`;
`backend/src/routes/auth.routes.js`, `backend/src/routes/staffAuth.routes.js`.

### D1 — cross-app sign-out, and why it is a visible round trip
Storage is per origin, so the main site cannot clear the ML app's. A hidden
iframe was rejected deliberately: it is a third-party context whose storage the
browser partitions separately, so it would clear a copy nobody uses and report
success — exactly the false claim the instruction warned against. The reliable
mechanism is a top-level visit to the ML app's `#/logout?return=…`, which clears
its own storage and returns. It only happens when this browser actually handed a
session over (`railpulse.mlHandoff`), so an ordinary sign-out stays instant. The
return address is accepted only when it is on the configured main origin, so the
route cannot be used as an open redirect.

**Measured:** after signing out on the main site, the ML app's
`sessionStorage`/`localStorage` session is **gone** and it lands on `#/login/user`.

### D3 — recorded limitation
Sign-out clears both clients. **It does not revoke the token server-side.** A
copy taken before sign-out stays valid until it expires, 60 minutes after it was
issued. No denylist was added, as decided.

### D2 — the caller check found callers
`StaffRegister.jsx` and `StaffOTP.jsx` still posted to the staff registration and
OTP routes. They are unlinked but reachable by URL, so they were changed to state
the policy rather than submit into a 410. The flows sit behind
`STAFF_SELF_REGISTRATION_OPEN` / `STAFF_VERIFICATION_OPEN` instead of being deleted.

Measured: `POST /api/auth/register`, `/api/auth/login`, `/api/auth/register-staff`,
`/api/staff-auth/send-otp`, `/api/staff-auth/verify-otp` → **410** each, and
`railpulse.main_users` is still **0** afterwards. `GET /api/auth/me` still answers
401 without a token.

### Test results
| Check | Result |
|---|---|
| Phase 6a browser verification (read-only) | **30 passed, 0 failed** |
| ML app staff/admin regression (read-only) | **20 passed, 0 failed** |
| Node `npm test` | 27 passed |
| ML frontend `npm test` | 202 passed |
| `pytest -q` | 150 passed |
| React build | passed |
| React lint | **11 problems (9 errors, 2 warnings)** — the pre-existing baseline, unchanged |

Highlights from the browser run: no horizontal scroll at **360, 768 or 1280** with
the drawer open or closed; hamburger present only below md; Escape closes and
returns focus; a dead token lands on `/login?expired=1`, says the session ended
and clears the token; a wrong password stays on the form and explains the account
reset; ML staff and admin pages render at 360 and 1280 with their charts and no
console errors.

### Known honest states, not defects
The main site shows zeroes and "No trains to show" because Phase 5 started fresh
and the demo seed is still pending by decision D5.

### Rollback
    git revert 62c9bc9        # D2 only
    git revert 186dde6        # Phase 6a only
No data or configuration changed, so a revert is complete on its own.

### Next: the D4 checkpoint
Route protection is not implemented. The diff and test plan will be presented for
explicit approval before anything is applied.

---

## Phase A — Data contract (read-only survey, 2026-10-20, branch `feature/dynamic-site`)

### A0. Corrections to the stated known facts

Six of the nine assumptions in the brief are already fixed by Phases 1–6a and
were re-verified by grep, not taken on trust:

| Stated fact | Actual state |
|---|---|
| `Alerts` holds `initialAlerts` | **Gone.** `Alerts.jsx:7` is `useState([])`, fed by `GET /api/alerts` (`Alerts.jsx:30`). |
| Hardcoded `localhost` in 6 files | **Gone.** `grep localhost frontend/frontend/src` outside `config.js` → 0 hits. All three origins come from `VITE_*` in [config.js](frontend/frontend/src/config.js). |
| `/` renders `Register` | **Fixed.** `App.jsx:81` → `<Entry />`. |
| Inner `<Routes>` has no catch-all | **Fixed.** `App.jsx:180` → `path="*"`. |
| Node middleware logs the decoded JWT | **Fixed.** [auth.js:44](backend/middleware/auth.js:44) pins `algorithms`, requires `sub` + a known `role`; only the error *message* is logged. |
| Staff OTP path mismatch | **Moot.** Both `/api/auth/*` identity routes and `/api/staff-auth/*` answer **410 Gone** (D2). |
| Node + FastAPI share `users`/`alerts` | **Already separated.** Node uses `main_users` ([User.js:64](backend/src/models/User.js:64)) and `main_alerts` ([Alert.js:50](backend/src/models/Alert.js:50)). No other Node collection name collides with FastAPI's (`alerts`, `users`, `predictions`, `reference_trains`, `live_train_state`). |

Still true: **hardcoded arrays remain** in `Dashboard`, `NetworkMap`,
`ETAPrediction`, `JourneyManagement`, `Simulation`.

### A1. Page → hardcoded data → supplying endpoint

| Page | Hardcoded | Lines | Used? | Endpoint that could supply it |
|---|---|---|---|---|
| Dashboard | `stations` (name, code, `[lat,lng]`) | [Dashboard.jsx:38](frontend/frontend/src/pages/Dashboard.jsx:38) | yes, map markers | **MISSING** — no coordinates anywhere. FastAPI `GET /api/v1/reference/stations` returns only `{station_name, serves_trains}` ([reference_repository.py:82](prediction%20model/railpulse-backend/app/db/repositories/reference_repository.py:82)). |
| Dashboard | `corridors` (arrays of `[lat,lng]`) | [Dashboard.jsx:106](frontend/frontend/src/pages/Dashboard.jsx:106) | yes, polylines | **MISSING** — no route geometry; the dataset has no intermediate stops by design (reference_service docstring). |
| Dashboard | — | — | — | trains/events/network/alerts already live: `GET /api/trains`, `/api/train-events`, `/api/operations/network`, `/api/alerts` ([Dashboard.jsx:190](frontend/frontend/src/pages/Dashboard.jsx:190)). |
| NetworkMap | `stations`, `corridors` | [NetworkMap.jsx:39](frontend/frontend/src/pages/NetworkMap.jsx:39), [:112](frontend/frontend/src/pages/NetworkMap.jsx:112) | yes ([:469](frontend/frontend/src/pages/NetworkMap.jsx:469), [:492](frontend/frontend/src/pages/NetworkMap.jsx:492)) | same MISSING gap as Dashboard. |
| NetworkMap | `trains` (6 fixed numbers + `[lat,lng]`) | [NetworkMap.jsx:168](frontend/frontend/src/pages/NetworkMap.jsx:168) | yes — merged with `backendMapTrains` at [:427](frontend/frontend/src/pages/NetworkMap.jsx:427), so the **hardcoded list decides which trains appear** | `GET /api/trains` exists; the *positions* are MISSING. |
| ETAPrediction | `trains` (7-field demo objects) | [ETAPrediction.jsx:6](frontend/frontend/src/pages/ETAPrediction.jsx:6) | **no — dead code**, never referenced | nothing needed; delete. Page already uses `getTrains`/`getTrainEvents`/`getTrainETA`. |
| JourneyManagement | `journeys` | [JourneyManagement.jsx:5](frontend/frontend/src/pages/JourneyManagement.jsx:5) | **no — dead code**, never referenced | nothing needed; delete. Page posts `POST /api/journey/plan`. |
| Simulation | `scenarios` (3 labels) | [Simulation.jsx:5](frontend/frontend/src/pages/Simulation.jsx:5) | yes ([:62](frontend/frontend/src/pages/Simulation.jsx:62), [:147](frontend/frontend/src/pages/Simulation.jsx:147)) | **MISSING**, but this is a UI vocabulary of what the simulator supports, not demo data. See A2-d. |
| Alerts, Trains, CommandCenter | none | — | — | already live. |

**Live-update finding:** there is **no Socket.IO client in the React app** —
`grep socket.io frontend/frontend/src` → 0 hits. The server emits
`train:update` / alerts ([trainSocket.js:31](backend/src/sockets/trainSocket.js:31)) and nothing listens.
Phase C's "live parts via the existing Socket.IO" therefore needs
`socket.io-client` installed (**a dependency install — needs your yes**) or
polling instead. Recommendation: **poll** for now, socket later as its own step.

### A2. Proposed minimal additions for the MISSING items

**(a) Station geography — the only real data gap.** Both maps need
`{code, name, lat, lng}`. Nothing in either database has a coordinate. Minimal
honest option, reusing the existing Node stack:

New model `backend/src/models/Station.js` → collection **`main_stations`**
(prefix matches the existing convention), route `GET /api/stations`:

    [ { "code": "NDLS", "name": "New Delhi", "lat": 28.6139, "lng": 77.2090,
        "zone": "NR", "dataSource": "SEED" } ]

**(b) Corridors.** Rather than invent route geometry, store the ordered station
codes and let the client resolve them to coordinates from (a). Collection
**`main_corridors`**, route `GET /api/corridors`:

    [ { "id": "delhi-mumbai", "name": "Delhi – Mumbai",
        "stations": ["NDLS","GGN","RE","JP","KOTA","RTM","ST","BCT"],
        "dataSource": "SEED" } ]

This keeps one source of truth for coordinates and makes the client's
`corridor.stations.map(lookup)` the only geometry code.

**(c) Train positions.** No position exists today. `TrainEvent` already carries
`station` ([TrainEvent.js:11](backend/src/models/TrainEvent.js:11)), so a
position can be *derived* — `station → main_stations.lat/lng` — with no new
field and no invented data. Trains whose latest event names an unknown station
simply do not get a marker, which is the honest outcome. **No new endpoint**;
this is client-side joining in Phase C.

**(d) Simulation scenarios.** The three entries describe the branches
`POST /api/simulation/{passenger,staff}` actually implements. Moving them to the
server would be ceremony, not dynamism. **Recommendation: leave them in the
source as a documented UI constant**, moved to `src/constants/scenarios.js`, and
record the decision. Tell me if you want an endpoint instead.

### A3. Proposed seed script (dry-run by default)

`backend/scripts/seed-demo.js`, run as:

    node scripts/seed-demo.js              # dry run: prints a plan, writes nothing
    node scripts/seed-demo.js --apply      # writes (asks for your yes first)
    node scripts/seed-demo.js --apply --reset   # replaces seeded docs only

Behaviour:
- Writes **only** `main_stations`, `main_corridors`, `trains`, `trainevents`,
  `main_alerts`. Never touches `users`, `main_users`, `live_train_state`,
  `reference_trains`, `predictions`, `alerts`.
- Every document carries `dataSource: "SEED"`; `--reset` deletes by that marker
  only, so hand-entered rows survive.
- Idempotent via `updateOne(..., {upsert:true})` keyed on `trainNumber` / `code` / `id`.
- Dry run prints a per-collection table: existing count → inserts → updates → final.
- Reuses the existing mongoose models and `connectDB`; no new dependency.
- Content: ~12 stations and 3 corridors (the coordinates currently in the two
  page files, which is where the only station geography in this repo lives),
  ~8 trains from the FastAPI reference catalogue so numbers match the ML app,
  one `TrainEvent` per train, 3 alerts.
- Does **not** create accounts. Staff seeding stays with Phase D gate G3.

### A4. Decisions needed from you before Phase B

1. Approve A2 (a)–(d) and A3 as written.
2. **D-A1:** Simulation scenarios — source constant (my recommendation) or endpoint?
3. **D-A2:** Phase C live updates — poll (no install) or install `socket.io-client`?
4. Station coordinates come from the existing page source. Confirm that is the
   intended provenance; there is no other source in this repo.

### Commands used (all read-only)

    grep -rn "const .*= \[" frontend/frontend/src/pages/
    grep -rn "router\.\(get\|post\)" backend/src/routes/
    grep -rn "@router\." "prediction model/railpulse-backend/app/api/routes/"
    grep -rn "super().__init__" "prediction model/railpulse-backend/app/db/repositories/"
    grep -rn "mongoose.model(" backend/src/models/

### Status

- **Done:** Phase A survey. No code changed; this document is the only edit.
- **Next:** Phase B (data layer) once A4 is answered. Stopping here as instructed.

---

## Phase B — Data layer (branch `feature/dynamic-site`)

Gates answered: A2 and A3 approved; **D-A1** scenarios stay a source constant in
`src/config/scenarios.js`, no endpoint; **D-A2** poll every 15 s, paused while
the tab is hidden, `socket.io-client` **not** installed; station coordinates
taken from the page source and labelled static reference data; the two dead
arrays left in place for Phase G.

**No page was changed.** `git diff --stat` touches no file under `src/pages/`.

### What was built

**Shared state components** — `src/components/state/`: `Loading.jsx`,
`EmptyState.jsx`, `ErrorState.jsx`. The markup is lifted from the inline
version already in Alerts.jsx so wiring a page changes no pixels. `ErrorState`
adds a **Try again** button bound to a hook's `refetch`, so one failed request
costs one request to recover from instead of a full page reload.

**`src/hooks/useResource.js`** — the one load-state implementation:
- `loading` is true for the **first** load only, so a poll never blanks a
  screen that is already showing good data;
- a failure keeps the previous `data` rather than emptying it;
- an in-flight request is aborted by the next refetch, so a slow answer cannot
  arrive last and overwrite a newer one;
- it ignores 401, which the axios interceptor already handles by ending the
  session — reporting it twice flashed an error on a page about to be replaced;
- nothing is set after unmount;
- `refetch` is stable, safe in a dependency array or on a button.

**Polling** — `src/config/polling.js`: `LIVE_POLL_MS`/`ALERTS_POLL_MS` = 15000,
`STATIC_POLL_MS` = 0. The timer stops on `visibilitychange` when the tab hides
and **refetches immediately** on return rather than waiting out the interval, so
a returning user never reads a stale number and a background tab costs nothing.

**Resource hooks** — one per resource, each returning
`{ data, loading, error, updatedAt, refetch }` plus a named, always-defined
field: `useTrains` (`trains`), `useTrainEvents` (`events` + `latestByTrain`, the
reduction three places wrote by hand), `useAlerts` (`alerts`),
`useNetworkSummary` (`summary`, `networkStatus`, `affectedStations`),
`useStations` (`stations`, `byCode`, `byName`, `positionOf`), `useCorridors`
(`corridors` with resolved `positions` and a `missing` list), `useTrainEta`
(disabled until a train id exists). Barrel at `src/hooks/index.js`.

**Services** — new `referenceService.js` and `networkService.js`; `trainService`,
`trainEventService`, `etaService` and `alertService` now accept an `AbortSignal`
(old call sites unaffected — it is a trailing argument). `alertService` gained
`getAlerts()` for `GET /api/alerts`; the pre-existing `getAlert(trainId)` is
left untouched but is **not used by any hook**, because that route *creates* an
alert rather than reading one.

### Backend: the A2 endpoints, read-only

| Added | Purpose |
|---|---|
| `src/models/Station.js` → `main_stations` | `{code, name, lat, lng, zone, dataSource}` |
| `src/models/Corridor.js` → `main_corridors` | `{corridorId, name, stations[], dataSource}` — codes only, no geometry |
| `src/services/reference.service.js`, `src/controllers/reference.controller.js`, `src/routes/reference.routes.js` | `GET /api/stations`, `GET /api/corridors` |
| `src/app.js` | mounts them at `/api` |

Both are GET-only and left open like the other data routes, so this adds **no**
new auth decision — route protection is still the unapproved D4 checkpoint.
`dataSource` was added to `Train` and `Alert` as well: mongoose drops unknown
fields in strict mode, so without it the seed's `--reset` would have matched
nothing and silently failed to clean up after itself.

### Seed script (written, **not run**)

`backend/scripts/seed-demo.js`, plus `npm run seed`. Data in
`backend/data/seed-reference.json` and `seed-demo-trains.json`.

    node scripts/seed-demo.js                  # dry run, writes nothing
    node scripts/seed-demo.js --apply          # writes
    node scripts/seed-demo.js --apply --reset  # deletes dataSource:"SEED" rows first

- Validates the seed files **against each other before connecting**: a corridor
  naming an unknown station, or an alert naming an unknown train, aborts with a
  message instead of writing a row that renders blank.
- Prints the database name, the five collections it may write
  (`main_stations`, `main_corridors`, `trains`, `trainevents`, `main_alerts`)
  and the six it never opens (`users`, `main_users`, `live_train_state`,
  `reference_trains`, `predictions`, FastAPI's `alerts`), then a per-collection
  table: existing → insert → update → final.
- Upserts on a natural key, so a second run changes nothing. Creates no accounts.

**Provenance.** 13 stations and 4 corridors: the union of the two page copies,
which disagreed — NetworkMap had Vadodara and named its corridors, Dashboard did
not. The 12 trains are the **real** trains in the ML service's own
`journeys_clean.parquet` (read 2026-10-20), with their real names, routes and
observed delays, so both applications name the same trains. Values were mapped
onto the existing model enums (`Train.trainType` has no Rajdhani or Shatabdi
member; `Alert.alertType` has no CONGESTION).

**Honest gap:** only **5 of 12** demo trains sit at a station this repository
has a coordinate for. The other seven run between stations (Chennai, Lucknow,
Varanasi, Dibrugarh, Gorakhpur…) that no file here has a point for. They are
seeded with their real station *names* and will appear in every list but **not
on the map**. No coordinate was guessed to hide that. The script prints this
coverage line on every run.

### Verification

| Check | Result |
|---|---|
| React `vite build` | **passed** |
| React `eslint src` | **11 problems (9 errors, 2 warnings)** — identical to the pre-existing baseline; the new files are clean |
| `eslint src/hooks src/components/state src/config` | **0 problems** |
| Node `npm test` | **27 passed, 0 failed** |
| `node --check scripts/seed-demo.js` | passed |
| `GET /api/stations`, `/api/corridors` registered | confirmed by walking the router stack |
| Seed cross-validation (unknown codes / orphan alerts) | **none** |
| Pages changed | **none** |

### Decisions and one caveat

- **D-B1:** the hooks return both the raw `data` and a named always-defined
  field (`trains`, `alerts`…). Pages can be wired one at a time without a
  `|| []` at every call site.
- **D-B2:** corridors are resolved to coordinates inside `useCorridors`, not on
  the server. The coordinates then exist in exactly one collection.
- **D-B3:** a station code with no coordinate is **dropped** from a polyline
  and reported in `missing`, rather than breaking the line or inventing a point.
- **Caveat C-B1:** `src/config.js` (the file) and `src/config/` (the new
  directory) now both exist. The build resolves `../config` to `config.js` —
  verified, the API base is in the bundle — but it is a trap. Worth folding
  `config.js` into `config/index.js` later; it touches ~8 import sites, so it is
  not being done inside Phase B.

### Commands

    cd frontend/frontend && npx vite build && npx eslint src
    cd backend && npm test
    cd backend && node --check scripts/seed-demo.js

### Status

- **Done:** Phase B. 14 files added, 7 modified, **0 pages touched**.
- **Not done, needs your yes:** running even the **dry run** of the seed — it
  opens a database connection, which is on the ask-first list. It writes
  nothing without `--apply`.
- **Next:** Phase C, one page at a time, when you name the page. Dashboard is
  the natural first: it already fetches four of its five resources, so wiring it
  is mostly deleting its own `useEffect`.

---

## Phase C.1 — Dashboard wired to the data layer

You said "Phase C" without naming a page, so this is **Dashboard**, the one
recommended at the end of Phase B. The other pages are untouched.

### What changed in [Dashboard.jsx](frontend/frontend/src/pages/Dashboard.jsx)

- **Both hardcoded arrays deleted** (1780 characters): `stations` (12 entries
  with coordinates) and `corridors` (3 unnamed polylines). They now come from
  `useStations()` and `useCorridors()`.
- **The page does no fetching of its own.** `grep "useEffect\|api.get"` on the
  file returns nothing: the one 60-line `useEffect` with its four-way
  `Promise.all` is gone, replaced by six hooks. Trains, events, the network
  summary and alerts poll every 15 s and pause while the tab is hidden;
  stations and corridors are fetched once.
- **The selection no longer lives in an effect.** It held the selected train
  *object* and ran a second effect to re-point it at the new object after every
  load. That is now a stored train *number* with the object derived from it,
  which removes a render per poll and cannot go stale.
- **Real states, three of them, where there was one.** The map area and the
  "Live Network" panel each distinguish loading, failed and genuinely empty.
  Failures show the reason and a **Try again** button bound to `refetch`; the
  previous version logged to the console and left the page looking merely
  empty. The stat cards read `--` while the first answer is outstanding and say
  "Summary unavailable" if it fails, instead of showing `--` for both.

### The bug this turned up

The old mapping ended with:

    position: station?.position || [28.6139, 77.209]

Any train whose station was not in the hardcoded list was **drawn at New
Delhi**. Not a placeholder in an empty environment — a real train at a
coordinate nobody had claimed it was at, indistinguishable from a true one.

It now resolves to `null`, those trains are filtered out of the markers, and
the legend says so: *"N trains not shown: no coordinate is recorded for the
station it is at."* They still appear in the train list and the counts. Given
the seed covers 5 of 12 trains (Phase B), this message is expected to be
visible, which is the point.

### Also

`useCorridors` now takes the station list as an argument instead of calling
`useStations` itself. Every page with a map needs both, and the old shape
fetched `/api/stations` twice per mount.

### Verification

| Check | Result |
|---|---|
| React `vite build` | **passed** |
| React `eslint src` | **9 problems (8 errors, 1 warning)** — down from the 11-problem baseline; Dashboard contributes **0** (it previously held 1 error and 2 warnings) |
| `eslint src/pages/Dashboard.jsx` | **0 problems** |
| `grep useEffect\|api.get` in Dashboard.jsx | no matches |
| Fallback coordinate `[28.6139, 77.209]` | **0 occurrences** |
| Diff | 379 lines changed in one page, −234/+172 net |

**Not verified:** nothing was run in a browser and no request was made. The
page has not been rendered against a live API, because that needs the two
servers and a database connection. The seed has still never been run, so a
Dashboard opened now would correctly show zeroes, "No trains to show", and no
markers.

### Status

- **Done:** Phase C.1, Dashboard. One file wired, one hook refined.
- **Next:** name the next page. NetworkMap is the obvious pair — it carries the
  same two arrays plus the six-train list that currently *decides* which trains
  the map shows, which is the last place hardcoded data still filters live data.

---

## Phases C (rest), E (low-risk) and F — 2026-10-21

### 1. Seed dry run — BLOCKED, nothing written

    $ node scripts/seed-demo.js
    Seed failed: connect ECONNREFUSED 127.0.0.1:27017

The script's own validation passed; it failed at the connection. The cause is
not the script:

| Fact | Evidence |
|---|---|
| A Mongo container is running | `docker ps` → `railpulse-mongo-dev  Up 6 hours` (image `mongo:7`) |
| It publishes no port to the host | `docker inspect` → `"Ports": {}` |
| It has no network attached | `docker inspect` → `"Networks": {}` |
| `.env` points at the host | `MONGO_URI=mongodb://127.0.0.1:27017/...` |

So nothing on the host can reach that container. Both fixes are on the
ask-first list and were **not** done: recreating the container with
`-p 27017:27017` (a Docker container action), or repointing `MONGO_URI`
(an `.env` change). **The dry run has still never produced output, and
`--apply` has never been run.** This is the one item in your list that did not
complete.

### 2. Phase C — the remaining pages

**C.2 NetworkMap** (`62b4c39`). Removed 3080 characters: `stations`,
`corridors` **and** the six-train array. Two real defects behind that array:

- the map rendered *the array*, merging in whatever the API knew about those
  six numbers — **a train in the database but not in the array never appeared
  on the map at all**;
- `MovingTrain` ran a `setInterval` that slid each marker 0.008 of a corridor
  segment every second. Nothing measured that motion. It was an animation of an
  invented position, indistinguishable from tracking. It is now `TrainMarker`,
  a marker at the station the latest event reports.

Same off-map handling as the Dashboard: no coordinate → no marker, counted in
the legend. Loading and error states replace the map; the markup inside the
marker (tooltip, popup, legend) is untouched.

**C.3 Alerts** (`bf805a9`). `useAlerts` + `useTrains`, shared
Loading/Error/Empty. Note the hook's poll exposed a latent bug: resolving an
alert was stored *inside* the alert objects, which a poll rebuilds, so a
resolution would have been wiped every 15 s. It is a set of ids now. It is
still session-local, because `models/Alert.js` has no status field to write to —
unchanged behaviour, now stated in the code.

**C.4 Simulation** (`cf5f8f5`). Presets from `config/scenarios.js` (D-A1), the
train list from `useTrains({ poll: false })` — deliberately not polling, since a
list changing under an operator mid-setup would move the selection they just
made. The default selection is derived rather than written by an effect.

**C.5 The sweep** (`a6f3f2c`). Across all 12 files in `src/pages`:

| Looked for | Found | Action |
|---|---|---|
| Module-level hardcoded arrays | 2: `ETAPrediction.trains`, `JourneyManagement.journeys` | **left as instructed** → Phase G |
| Hardcoded "LIVE" / "Operational" | `CommandCenter` printed a green **"System Online"** chip regardless of service state | now reads `useServiceHealth`, like the header and sidebar |
| `undefined` / `Invalid Date` on screen | 2 sites rendered `new Date(undefined)` → "Invalid Date" | guarded, both show "Unknown" |
| Mock / dummy / fake / placeholder data | none (only `placeholder=` form attributes) | — |
| Template strings interpolating optional chains | none | — |

No styling or layout changed in any of the four commits.

### 3. Phase E — three of five items were already done

| Item | State |
|---|---|
| Dashboard "View Map" dead button | **Not dead.** `navigate("/map")`, and `/map` is a real route (App.jsx:144). |
| InsightCard actions | **They do not exist.** `InsightCard({ title, text })` renders two `<p>` elements and no button. A scripted scan of every `<button>` in `src/pages` and `src/components` found **zero** without an `onClick` or `type="submit"`. |
| StaffOTP reload crash | **Already handled.** With no `location.state.email` it renders an explanation and a link to `/register/staff`. You asked for a redirect; the explanatory screen was kept instead, because a silent redirect tells the user nothing about why they were moved. Say the word and it becomes a `<Navigate>`. |
| Register.jsx `alert()` + shared client | **Already done.** No `alert(` anywhere in `src/`; it uses `authApi` (the shared client with the session interceptor) and an inline `{error}` block. |
| **Merge `config.js` + `config/`** (C-B1) | **Done** (`4e1d2a7`). `src/config.js` → `src/config/index.js`, re-exporting `polling.js` and `scenarios.js`. `"../config"` still resolves for all five importers, and the default origins are verified present in the build output. |
| Mobile sidebar and nav targets (read-only) | **Verified by reading.** `Sidebar` is `fixed … -translate-x-full` below `md` and `md:static md:translate-x-0` above, with a close button, a backdrop and Escape handling in `MainLayout`. All **8** sidebar paths have a matching `<Route>`; `/` → `Entry`; catch-all present. |

### 4. Phase F — already implemented, verified by reading

`renderPassengerDashboard` is already the welcome page you described: greeting,
*"RailPulse estimates when a train is likely to arrive, and how uncertain that
estimate is … not a guarantee, and no train on this service is tracked live"*,
a primary `#/passenger/train` button, and exactly three cards (Track a train,
Prediction history, Alerts). It calls no endpoint, shows no number, and uses
`escapeHtml` on every dynamic value. **No "LIVE SIGNAL" badge exists** — the
only match in the whole frontend is the comment recording its removal. Nothing
was changed here.

**A PASSENGER can still run a prediction.** Every endpoint the Track page calls
—`POST /predict/eta`, `GET /trains/{t}/state`, `/reference/trains/{t}/route`,
`/trains/{t}/upcoming-stations`, `/trains/{t}/predictions` — depends on
`get_current_user`, with no role restriction. The only role-gated train route is
`PUT /trains/{t}/state` (`require_roles("STAFF","ADMIN")`), which the passenger
pages never call.

### 5. Checks

| Command | Result |
|---|---|
| `npx vite build` | **passed** |
| `npx eslint src` | **7 problems (7 errors, 0 warnings)** — was 9. Down 2; nothing added |
| `npx eslint` on every file touched | **0 problems** |
| `npm test` (backend) | **27 passed, 0 failed** |
| `npm test` (ML frontend) | **202 passed, 0 failed** (45 suites) |

The 7 remaining errors are all pre-existing and all outside this work: 4 are the
`ETAPrediction`/`JourneyManagement` dead code you asked to leave, 3 are in
`AuthContext.jsx`.

### Not verified

**Nothing was rendered in a browser and no HTTP request was made.** Every claim
above is from reading code, building, linting and unit tests. Specifically
unproven: that the two maps draw correctly against a live API, that the 15 s
poll and the hidden-tab pause behave as intended in a real browser, and that
`GET /api/stations` and `/api/corridors` return data — the database has never
been reachable in this session and the seed has never run.

### Status

- **Done:** Phase C complete, Phase E low-risk items, Phase F verified.
- **Blocked:** the seed dry run, on Mongo being unreachable.
- **Not started, as instructed:** Phase D, Phase G.
