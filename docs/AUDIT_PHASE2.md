# Phase 2 — audit and plan (read-only)

Date: 2026-10-20. Branch `feature/unified-auth-db`. Nothing in this phase changed
application code, configuration or data. The only files written were this report,
`docs/UNIFY_PROGRESS.md`, and the screenshots under
`prediction model/railpulse-backend/reports/figures/audit/`.

---

## 1. Baseline (real output)

All four services were already running, so no dependency was installed: `npm ci`
and `pip install` were deliberately **not run**, because installing is on the
ask-first list and `node_modules` plus `.venv` were present and working.

| Check | Command | Result |
|---|---|---|
| React build | `cd frontend/frontend && npm run build` | **passed** — 2010 modules, built in 570 ms. Warning: `dist/assets/index-Cp8_H3Nr.js` is 580.32 kB (gzip 168.45 kB), over Vite's 500 kB advice. `dist/` is untracked, so building changed nothing in git. |
| React lint | `cd frontend/frontend && npm run lint` | **failed — 13 problems (11 errors, 2 warnings), all pre-existing** (see below) |
| Node tests | `cd backend && npm test` | **passed — 14/14** (`tests/mlEta.service.test.js`) |
| FastAPI tests | `cd "prediction model/railpulse-backend" && .venv/bin/python -m pytest -q` | **passed — 149 passed**, 3 deprecation warnings from Starlette/httpx |
| ML frontend tests | `cd "prediction model/railpulse-frontend" && node --test tests/` | **passed — 183/183** (174 before Phase 1 + 9 added in Phase 1) |

### Pre-existing lint failures (not introduced by this work)

| File:line | Rule | Message |
|---|---|---|
| `src/context/AuthContext.jsx:14` | react-hooks/set-state-in-effect | setState called synchronously in an effect |
| `src/context/AuthContext.jsx:27` | no-unused-vars | `error` defined but never used |
| `src/context/AuthContext.jsx:68` | react-refresh/only-export-components | file exports a hook next to a component |
| `src/pages/Alerts.jsx:6` | no-unused-vars | `initialAlerts` assigned but never used |
| `src/pages/Alerts.jsx:66` | no-unused-vars | `loading` assigned but never used |
| `src/pages/Dashboard.jsx:269` | react-hooks/set-state-in-effect | setState called synchronously in an effect |
| `src/pages/Dashboard.jsx:271` | react-hooks/exhaustive-deps (warning) | missing dependency `selectedTrain?.number` |
| `src/pages/ETAPrediction.jsx:6` | no-unused-vars | `trains` assigned but never used |
| `src/pages/ETAPrediction.jsx:109` | no-unused-vars | `loading` assigned but never used |
| `src/pages/JourneyManagement.jsx:5` | no-unused-vars | `journeys` assigned but never used |
| `src/pages/JourneyManagement.jsx:80` | no-unused-vars | `journeyOptions` assigned but never used |
| `src/pages/NetworkMap.jsx:278` | react-hooks/exhaustive-deps (warning) | missing dependency `corridor.positions` |
| `src/pages/NetworkMap.jsx:379` | no-unused-vars | `loading` assigned but never used |

The five `loading` / `journeys` / `trains` / `initialAlerts` findings are the
same defect seen from the lint side: those pages declare a loading flag or a
mock dataset and then never render it, which is why several screens show a blank
area instead of a spinner or an error (A-21).

---

## 2. Database inventory (read-only)

Two MongoDB containers are running. Only one is reachable.

| Container | Published ports | Reachable from the apps? |
|---|---|---|
| `railpulse-mongo` | `0.0.0.0:27017->27017` | **yes** — this is the server both apps use |
| `railpulse-mongo-dev` | none | **no** — nothing can connect to it |
| `railpulse-redis` | `0.0.0.0:6379->6379` | yes — Node live train state only |

### `railpulse-mongo` (port 27017)

| Database | Collection | Docs | Indexes | Newest write |
|---|---|---|---|---|
| `railpulse` | `users` | 18 | `_id_`, `username_1` | 2026-10-20 11:12 UTC |
| `railpulse` | `predictions` | 135 | `_id_`, `train_number_1_timestamp_-1` | 2026-10-20 11:24 UTC |
| `railpulse` | `live_train_state` | 16 | `_id_`, `train_number_1` | 2026-10-20 11:07 UTC |
| `railpulse` | `reference_trains` | 12 | `_id_`, `train_number_1`, `train_name_1`, `source_1_destination_1` | 2026-10-20 06:23 UTC |
| `railpulse` | `simulation_states` | 6 | `_id_`, `train_number_1` | 2026-10-20 06:23 UTC |
| `railpulse` | `alerts` | 0 | `_id_`, `train_number_1_created_at_-1`, `acknowledged_1` | empty |
| `railpulse_node` | `users` | 1 | `_id_`, `email_1`, `employeeId_1` | 2026-10-20 08:52 UTC |
| `railpulse_node` | `trains` | 1 | `_id_`, `trainNumber_1` | 2026-10-20 11:22 UTC |
| `railpulse_node` | `trainevents` | 1 | `_id_` | 2026-10-20 11:22 UTC |
| `railpulse_node` | `etapredictions` | 1 | `_id_` | 2026-10-20 11:24 UTC |
| `railpulse_node` | `journeys` | 1 | `_id_` | 2026-10-20 09:02 UTC |
| `railpulse_node` | `alerts`, `bottlenecks`, `propagations`, `recoveries`, `riskassessments`, `simulations` | 0 | `_id_` | empty |

### `railpulse-mongo-dev` (unreachable)

| Database | Contents |
|---|---|
| `railpulse` | Node shape: `trains` 5, `trainevents` 5, `alerts` 3, `etapredictions` 3, `journeys` 1, `users` 1 |
| `railpulse_eta_ml` | ML shape: `users` 2, everything else empty |

### Every connection string and database env var

| Where | Variable / literal | Value | Notes |
|---|---|---|---|
| `backend/.env` | `MONGO_URI` | `mongodb://127.0.0.1:27017/railpulse_node` | untracked file; the Node database is **`railpulse_node`** |
| `backend/.env` | `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `backend/src/config/db.js:4` | `MONGO_URI` | no default — throws if unset | |
| `backend/src/config/redis.js:4` | `REDIS_URL` | default `redis://localhost:6379` | |
| `prediction model/railpulse-backend/.env` | `MONGODB_URI` | `mongodb://localhost:27017` | untracked |
| `prediction model/railpulse-backend/.env` | `MONGODB_DB` | `railpulse` | the ML database is **`railpulse`** |
| `app/core/config.py:7-8` | defaults | `mongodb://localhost:27017`, `railpulse` | |
| `prediction model/README.md:107-108` | sample `.env` | `MONGODB_URI=mongodb://localhost:27017`, no `MONGODB_DB` | correct by omission (default is `railpulse`) |
| `Readme.md:34` | prose | "`railpulse` for the main app and `railpulse_eta_ml` for the ML app" | **wrong on both counts** (A-15) |
| `RailPulse/context2.md:486-488` | prose | `MONGO_URI=your_mongodb_connection` | old design notes |

### Safe to remove?

| Candidate | Who uses it | Evidence | Safe to remove? |
|---|---|---|---|
| `railpulse` on `railpulse-mongo` | FastAPI | `MONGODB_DB=railpulse`; 135 predictions, 18 users, written today | **No** |
| `railpulse_node` on `railpulse-mongo` | Node | `MONGO_URI`; 5 documents, written today (11:24 UTC) | **Not yet.** It is live. It only becomes a candidate after Phase 5 moves Node onto the ML database and its data is copied or deliberately abandoned. |
| `railpulse` on `railpulse-mongo-dev` | nobody | container publishes no ports, so no process can connect | Likely, **but unverified as "never used"** — it is a container question, not just a database one, and needs your approval (Phase 7) |
| `railpulse_eta_ml` on `railpulse-mongo-dev` | nobody | same; also near-empty | Same as above |
| Redis | Node `liveState.service.js` only | `getTrainState` / `updateTrainState` / `removeTrainState` | **No** — it is the only store of live train state (G5) |

---

## 3. Link and route map

### React app (`frontend/frontend`, :5173)

| Source | Target | Target exists? | Who may open it | Verdict |
|---|---|---|---|---|
| `Sidebar.jsx:20` nav "Dashboard" | `/` | yes, but `/` renders **Register** | anyone | **broken (A-03)** |
| `Sidebar.jsx:26` "Command Center" | `/operations` | yes | STAFF, ADMIN (hidden otherwise) | ok |
| `Sidebar.jsx:31` "Trains" | `/trains` | yes | any signed-in | ok |
| `Sidebar.jsx:36` "Network Map" | `/map` | yes | any signed-in | ok |
| `Sidebar.jsx:41` "Journey Management" | `/journey` | yes | any signed-in | ok |
| `Sidebar.jsx:46` "ETA Prediction" | `/eta` | yes | any signed-in | ok |
| `Sidebar.jsx:51` "Simulation" | `/simulation` | yes | STAFF, ADMIN | ok |
| `Sidebar.jsx:56` "Alerts" | `/alerts` | yes | any signed-in | ok |
| `Sidebar.jsx:145` "ETA prediction using ML model" | `http://localhost:3000` | yes | any signed-in | **hardcoded, no handoff, no role target, no way back (A-11)** |
| `Sidebar.jsx:66` Logout | `/login` | yes | — | ok (clears only React storage) |
| `Login.jsx:33` after login | `/dashboard` | yes | — | ok — and the only link to `/dashboard` anywhere |
| `Login.jsx:267,278` "← Back", "Register" | `/register` | yes | — | ok (two buttons, one destination) |
| `Register.jsx:221` "Register as Staff" | `/register/staff` | yes | — | ok |
| `Register.jsx:234` "Login" | `/login` | yes | — | ok |
| `Register.jsx:49` after register | `/login` | yes | — | ok |
| `StaffRegister.jsx:44` after submit | `/staff/verify-otp` | yes | — | reached only if the OTP call succeeds, which it cannot (A-01) |
| `StaffOTP.jsx:27` after verify | `/login` | yes | — | ok |
| `RoleRoute.jsx:26` wrong role | `/` | yes, but renders **Register** | — | **broken (A-03)** |
| `ProtectedRoute.jsx:22` anonymous | `/login` | yes | — | ok — confirmed at runtime |
| inner `<Routes>` (`App.jsx:69`) | no `*` route | — | — | **unknown paths render an empty shell (A-04)** |

Runtime check, anonymous: `/dashboard` → `/login`, `/operations` → `/login`. Both correct.

### ML app (`prediction model/railpulse-frontend`, :3000)

| Source | Target | Exists? | Verdict |
|---|---|---|---|
| landing `#/` portals | `#/login/user`, `#/login/staff`, `#/login/admin` | yes | ok |
| auth links | `#/register`, `#/login/user`, `#/login/staff`, `#/login/admin`, `#/` | yes | ok |
| sidebar (`app.js:92`) | `#/<role>/{dashboard,train,history,alerts}` + `simulation`, `capabilities` (STAFF/ADMIN) + `system` (ADMIN) | yes | ok, role-filtered |
| passenger dashboard (Phase 1) | `#/passenger/{train,history,alerts}` | yes | ok |
| `renderAccessDenied` | `#/<role>/dashboard` | yes | ok |
| — | **no link back to the main site** | — | **missing (A-11)** |
| `renderPage` fallbacks (`app.js:186-196`) | `renderSimulation` / `renderCapabilities` / `renderSystem` | reachable by a PASSENGER typing `#/passenger/simulation` | **role leak (A-07)** |

Runtime check, anonymous: `#/passenger/dashboard` → `#/login/user`. Correct.

---

## 4. Audit table

Severity: blocker = a user-facing flow cannot complete; high = wrong behaviour or
a security hole; medium = visibly wrong or misleading; low = hygiene.

| ID | Sev | Evidence | What is wrong | Proposed fix | Risk of the fix |
|---|---|---|---|---|---|
| A-01 | blocker | `services/authService.js:22,40` vs `backend/src/app.js:65`. Measured: `POST /api/auth/staff/send-otp` → **404 (HTML)**, `POST /api/staff-auth/send-otp` → **400** | Staff registration posts the OTP to a path that does not exist. The 404 body is HTML, so `response.json()` throws and the user sees a JSON parse error. Staff signup cannot complete. | Point `authService` at `/api/staff-auth/*` | low |
| A-02 | blocker | `backend/src/services/otp.service.js:11-16`; `backend/.env` has no `EMAIL_USER` / `EMAIL_PASS` | Even with A-01 fixed, `sendMail` has no credentials and throws → 500. The OTP can never be delivered. | Decision G3 | n/a |
| A-03 | blocker | `App.jsx:34`, `Sidebar.jsx:20`, `RoleRoute.jsx:26` | `/` renders `Register`. A signed-in user clicking "Dashboard" lands on the signup form, and a wrong-role redirect sends them there too. | `/` redirects by auth state; nav and `RoleRoute` point at `/dashboard` | low |
| A-04 | high | `App.jsx:69-131` | The inner `<Routes>` has no catch-all, so an unknown path renders the chrome around an empty `<main>`. | add a `*` route | low |
| A-05 | high | `auth.controller.js:157-162` | `/auth/me` returns the raw JWT payload (`userId`, `role`, `iat`, `exp`). No name, no email, so `AuthContext.user` has no identity to show. | return the stored user | low |
| A-06 | high | `middleware/auth.js:5,9,24`; `server.js:6`; `otp.service.js:4-5` | Every authenticated request logs secret presence, header presence and **the whole decoded JWT payload**. `otp.service` logs the sending email address at import. | delete those `console.log`s | none |
| A-07 | high | `app.js:186-196` (ML) | A PASSENGER opening `#/passenger/simulation` is served the staff simulation form by the fallback chain; same for `capabilities` and `system`. The API still refuses (403), so no data leaks — the UI does. | gate the fallbacks by role, else `renderNotFound` | low |
| A-08 | high | Measured with no `Authorization` header: `GET /api/trains` **200**, `/api/train-events` **200**, `/api/alerts` **200**, `/api/operations/network` **200**; only `/api/trains/:id/eta` **401** | Everything except the ETA route is open, including `POST`/`PUT`/`DELETE /api/trains/:id` and `/api/train-events/:id`. Socket.IO has no auth and `origin: "*"` (`trainSocket.js:7`). React's role gating is cosmetic. | G6 | **high** — can break working screens |
| A-09 | high | `MainLayout.jsx:6`, `Sidebar.jsx:84` — `w-64` with no responsive class anywhere in the layout | The React sidebar is a fixed 256 px with no collapse. At 360 px it leaves 104 px for content. **Not confirmed at runtime**: every page behind the layout needs a login this session does not have. The anonymous pages (`/`, `/login`, `/register/staff`) have no sidebar and were clean at 360/768/1280. | collapsible sidebar with a toggle, mirroring the ML app | medium |
| A-10 | medium | `Sidebar.jsx:184`, `Header.jsx:18` | "Operational" and "System Online" are hardcoded strings. They stay green with every backend down. | read `/api/health` and the ML health endpoint, or say "status unavailable" | low |
| A-11 | medium | `Sidebar.jsx:145` | The ML link is a bare `<a href="http://localhost:3000">`: no login handoff, no role-specific target, and the ML app offers no link back. | Phase 6 + G4 | low |
| A-12 | medium | `Dashboard.jsx:346` ("View Map"), `CommandCenter.jsx:832` (`InsightCard` action) | Buttons with no handler. Verified by parsing every `<button>` opening tag in the app: these two are the only ones with neither `onClick` nor `type="submit"`. | wire or remove | low |
| A-13 | medium | `StaffOTP.jsx:9` | `email` comes only from router state. A reload or a direct visit sends `undefined`. | add a field, or redirect when state is missing | low |
| A-14 | medium | `routes/risk.routes.js`, `routes/bottleneck.routes.js`, `routes/propagation.routes.js` | Three route files exist and are never mounted in `app.js`. Their controllers duplicate `operations.controller`. | delete (needs approval) | low |
| A-15 | medium | `Readme.md:34` | States the main app uses `railpulse` and the ML app uses `railpulse_eta_ml`. Both are wrong: it is `railpulse_node` and `railpulse`. | rewrite in Phase 5 | none |
| A-16 | medium | `mlEta.service.js:62-83`; `app/core/config.py:16-19` | The Node→FastAPI bridge logs in as `ml-bridge`, but FastAPI only seeds `ADMIN_*` and `STAFF_*`. The account exists only because somebody created it by hand; a clean database breaks the bridge with no seeding path. | seed it from config, or document the manual step | medium |
| A-17 | low | `backend/src/config/staffVerification.js` | Five real personal email addresses are committed. Listed as an observation only; not edited. | your call | n/a |
| A-18 | low | `Register.jsx:30-49` | Raw `fetch` with a hardcoded URL, bypassing the axios client, and `alert()` for success. | use `api`, inline message | low |
| A-19 | low | `app/core/config.py:16-19`, `.env.example` | Ships `admin`/`staff` usernames with `change-me-*` passwords; only blocked when `ENVIRONMENT=production`. | note in docs | low |
| **A-20** | **high** | `alert.controller.js:3-10` → `alert.service.js:14-70`; route `GET /api/alerts/:trainId` | **A GET request writes.** Opening the Alerts page creates an `Alert` document and broadcasts `alert:new` over Socket.IO. The route is unauthenticated, so anyone can create alert rows in a loop. | make generation an explicit `POST`, and have the page read `GET /api/alerts` | medium — changes the Alerts page contract |
| **A-21** | **medium** | `Alerts.jsx:81` | The Alerts page hardcodes one train id, `6a9d5a64a663314c1afeaa69`, and renders a single alert. The five-entry `initialAlerts` mock above it is dead code. `loading` is set but never rendered. | read the list endpoint; drop the mock; render loading and error states | low |
| **A-22** | **high** | `Simulation.jsx:38-43` vs the database | Scenarios 2 and 3 post train ids `6a9d5aa7a663314c1afeaa71` and `6aa059ac1366fcd8e7e46558`, and **neither exists**: `railpulse_node.trains` holds exactly one document, `6a9d5a64…` (12951 Demo Rajdhani). Those two scenarios always fail, and the failure is only `console.error` — the UI shows nothing. | select a real train; surface the error | low |
| **A-23** | **medium** | `CommandCenter.jsx:162,179,196,213` | Risk, bottleneck, propagation and recovery are each pinned to the same hardcoded train id in four separate effects, whatever train the user selects. | derive the id from the selection | low |
| **A-24** | **low** | `simulationService.js:3` | `runPassengerSimulation` is exported and never called; `POST /api/simulation/passenger` has no caller. Same for `getTrainEventById`. | remove or wire | low |
| **A-25** | **low** | `vite build` output | The single JS chunk is 580 kB (gzip 168 kB); Leaflet and the map pages are loaded on every route. | route-level `import()` | low |

### What the runtime sweep showed

`reports/figures/audit/` holds 18 full-page screenshots and `audit_pass.json`.
Anonymous sweep, Chromium, at 360 / 768 / 1280:

- **Zero console errors and zero page errors on every page tested**, both apps.
- **No horizontal scroll anywhere** (`scrollWidth == clientWidth` at all three widths).
- Access control for anonymous visitors is correct in both apps: React `/dashboard`
  and `/operations` → `/login`; ML `#/passenger/dashboard` → `#/login/user`.
- The sweep could not sign in. Everything behind a login — the React sidebar at
  360 px (A-09), the role sweep across PASSENGER/STAFF/ADMIN, keyboard
  tab-through of the authenticated shell, and the cross-app flow — is **not
  verified**. See "Blocked" below.

### Authenticated sweep (run after you approved one test passenger)

A single throwaway account, `phase2_passenger` (PASSENGER, full name "Phase 2
Audit"), was registered through `POST /api/v1/auth/register` — HTTP 201, users in
`railpulse` went 18 → 19. Its password is not recorded in the repository. The
sweep then signed in through the real login form at 1280, 768 and 360.

| Page | 1280 | 768 | 360 | Console errors | Page errors |
|---|---|---|---|---|---|
| Dashboard (title "Welcome") | ok | ok | ok | 0 | 0 |
| Track a train | ok | ok | ok | 0 | 0 |
| Prediction history | ok | ok | ok | 0 | 0 |
| Alerts | ok | ok | ok | 0 | 0 |

"ok" = no horizontal scroll (`scrollWidth == clientWidth`). Screenshots:
`auth-<page>-<width>.png`; raw data `auth_pass.json`.

**End-to-end prediction, PASSENGER, train 12002 — works.** Typing the number into
the lookup and submitting produced:

- "Predicted arrival" panel with scheduled and predicted times
- "Most likely somewhere between 06:01 IST and 06:26 IST — that is +1.4 min to
  +26.4 min against the timetable" (the P10–P90 range)
- "Chance of arriving more than 15 minutes late: 44% — about 44 in 100 journeys
  that look like this one to the model"
- the synthetic-data notice, and 2 rendered charts
- The beats-baseline warning correctly did **not** appear: `/health/` reports
  `beats_baseline: true` (test MAE 21.8 min vs baseline 24.7 min), so the sentence
  is not supposed to show. It is wired to the real value, not hardcoded.

**A-07 confirmed at runtime.** A PASSENGER opening `#/passenger/simulation` is
served the staff page: `#simulation-form` is present, the "SIMULATION MODE" badge
renders, and the topbar reads "Simulation lab". Screenshot
`auth-simulation-leak-1280.png`.

**Keyboard order in the signed-in shell is correct.** Ten tabs from the top:
brand → Dashboard → Track train → Prediction history → Alerts → Sign out →
then the page's own cards (train, history, alerts) → the primary "Track a train"
button. No trap, no skipped landmark.

### Still blocked on you

#### Remaining gap


No usable credential exists for either app:

- **ML app**: 18 users; `ui_smoke.py:219-220` and `state_checks.py` generate a random
  password per run, so every `uismoke_*` / `statecheck_*` account is unrecoverable.
  `admin` / `staff` passwords live in the untracked `.env` (`change-me-*` by default).
- **Main app**: `railpulse_node.users` holds exactly one document and its bcrypt hash
  cannot be reversed.

Creating a test account is a database write, which needs explicit approval.

---

## 5. Plans for the decision gates

### G1 — one database

Default target, corrected: **`railpulse` on `railpulse-mongo` (port 27017)**, the
database FastAPI already uses. (The brief said `railpulse_eta_ml`; that database
exists only on the unreachable dev container.)

Files: `backend/.env` (`MONGO_URI` → `…/railpulse`), `backend/src/models/Alert.js`
(explicit `collection: "main_alerts"`), and the same for any other colliding model
— today only `Alert` and `User` collide by name. `backend/src/models/User.js` stops
being registered (`auth.service.js`, `staffAuth.controller.js` import it), and every
remaining model gets `autoIndex: false` so Mongoose cannot add indexes to a shared
collection. The other nine Node collections do not collide.

- **G1a — copy the non-user collections** from `railpulse_node` into `railpulse`
  with an idempotent script (dry-run default, counts printed before and after).
  5 documents move. Users are never copied.
- **G1b — start fresh.** Node's data is 1 train, 1 event, 1 journey, 1 ETA row.
  Re-seeding is cheap.

Rollback: restore `MONGO_URI`; the copied collections are new names in `railpulse`
and can be dropped (with your typed confirmation) without touching FastAPI's.

### G2 — one login

FastAPI becomes the only identity provider, as the brief specifies. Files:
`backend/.env` + `prediction model/railpulse-backend/.env` (one shared secret),
`backend/middleware/auth.js` (verify FastAPI tokens, explicit `algorithms:["HS256"]`,
require `sub` and a known role, stop logging), `app/core/config.py` CORS value via
`.env` only, and on the React side `Login.jsx`, `Register.jsx`, `AuthContext.jsx`,
`services/api.js`, `services/authService.js`. Node's own `/api/auth/register|login`
stay in place but unused.

Cost to be explicit about: **existing users cannot be migrated.** bcrypt vs Argon2,
email vs username. The one Node user and the 18 FastAPI users do not merge; everyone
on the main site re-registers with a username.

Rollback: `git checkout` the five React files and `middleware/auth.js`; revert the
secret. No data changes.

### G3 — staff accounts (no default; your call)

- **S1 — seeded / admin-created, OTP pages hidden.** Smallest, and it matches what
  FastAPI already does. Keeps the OTP code in the tree. A-01 and A-02 become moot.
- **S2 — port verification + OTP to FastAPI.** Largest. Needs new endpoints, an
  email configuration that does not exist today (A-02), and a new store for the
  employee allow-list (which currently holds real personal addresses, A-17).
- **S3 — keep the Node OTP flow writing FastAPI-shaped users.** Node would have to
  hash with Argon2 to stay compatible, which means a new Node dependency and two
  code paths creating users. It also keeps A-02 alive.

### G4 — handoff to the ML app

Default: `#/sso?token=…` in the fragment, stored by the ML app, validated with
`/auth/me`, fragment stripped with `history.replaceState`. Weakness: the token is
briefly in browser history and in the tab's URL. Stronger: a one-time code
exchanged at a new FastAPI endpoint — that is a contract change, which the brief
otherwise forbids, so it needs your explicit yes.

### G5 — Redis

Default: **keep it.** It is a cache of live train state read by
`liveState.service.js` only. Moving it into Mongo means a new collection, a TTL
index, and changes to `train.controller.js`, `alert.service.js` and
`eta.service.js`. No reason to do it as part of this work.

### G6 — Node route protection (proposal only, not applied)

`authenticate` on everything under `/api` except `/api/health` and the existing
auth routes; `authorize("STAFF","ADMIN")` on `/api/operations`, `/api/simulation`,
and on every `POST`/`PUT`/`DELETE` under `/api/trains` and `/api/train-events`;
a Socket.IO handshake check and a real CORS origin instead of `*`. This will break
any screen currently relying on an open route, which is why it is a decision and
not a fix.

---

## 6. What I need from you

1. **G1** — confirm target `railpulse`, and pick **G1a** (copy 5 documents) or **G1b** (start fresh).
2. **G2** — yes/no to FastAPI as the only identity provider, knowing everyone re-registers.
3. **G3** — S1, S2 or S3.
4. **G4** — fragment handoff, or the one-time code.
5. **G5** — keep Redis (default) or not.
6. **G6** — approve, modify, or defer.
7. **Audit IDs** to fix in Phase 3.
8. **A credential, or permission to create one test passenger**, so the role sweep,
   the authenticated responsive check and the end-to-end prediction can actually run.
