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
