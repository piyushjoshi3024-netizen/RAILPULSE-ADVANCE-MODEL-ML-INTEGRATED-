# RailPulse

RailPulse estimates when a train is likely to arrive, and how uncertain that
estimate is. It is two applications sharing **one database** and **one login**:

| Part | Stack | Folder | Port |
|---|---|---|---|
| Main website | React 19 + Vite + Tailwind | `frontend/frontend` | 5173 |
| Main API | Node 20 + Express + Mongoose + Redis | `backend` | 5000 |
| ML API (**the only identity provider**) | FastAPI + XGBoost | `prediction model/railpulse-backend` | 8000 |
| ML frontend | Vanilla JS, hash router | `prediction model/railpulse-frontend` | 3000 |
| MongoDB | `mongo:7` in Docker | — | 27017 |
| Redis | `redis:7-alpine` in Docker | — | 6379 |

Nothing here is GPS-tracked. Every arrival is a model estimate with a range
around it, and the model is trained on a synthetic dataset. The UI says so
rather than implying a live feed.

---

## Quick start

**Requirements:** Docker, Node.js 20.19+ (or 22.12+), npm, Python 3.10+,
`openssl`. Five terminals, or run the first four in the background.

### 1. Databases

```bash
docker run -d --name railpulse-mongo --restart unless-stopped -p 27017:27017 -v railpulse-mongo-data:/data/db mongo:7
```

```bash
docker run -d --name railpulse-redis --restart unless-stopped -p 6379:6379 redis:7-alpine
```

If the names already exist, start them instead of creating duplicates:

```bash
docker start railpulse-mongo railpulse-redis
```

Check both answer:

```bash
docker exec railpulse-mongo mongosh --quiet --eval 'db.adminCommand({ping:1})' && docker exec railpulse-redis redis-cli ping
```

> **The container must publish port 27017.** A container that is "Up" but shows
> no `PORTS` in `docker ps` cannot be reached from the host, and every service
> will fail with `ECONNREFUSED 127.0.0.1:27017`. Check with
> `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`.

### 2. One secret, shared by both backends

Node does not issue tokens. It **verifies** the tokens FastAPI issues, so both
services must sign with the same HS256 secret. Generate it once:

```bash
openssl rand -hex 32
```

Put that one value in **both** files below: `JWT_SECRET` in `backend/.env` and
`JWT_SECRET_KEY` in `prediction model/railpulse-backend/.env`. If they differ,
sign-in appears to work and every main-site API call answers 401.

### 3. `backend/.env`

```ini
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/railpulse
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<the shared secret from step 2>

# The Node -> FastAPI bridge that fetches model predictions.
ML_ENABLED=true
ML_BASE_URL=http://127.0.0.1:8000/api/v1
ML_SERVICE_USERNAME=ml-bridge
ML_SERVICE_PASSWORD=<choose a local password>
ML_TIMEOUT_MS=4000
```

### 4. `prediction model/railpulse-backend/.env`

```ini
ENVIRONMENT=development
API_PREFIX=/api/v1
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=railpulse
JWT_SECRET_KEY=<the same shared secret from step 2>
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<choose a local admin password>
STAFF_USERNAME=staff
STAFF_PASSWORD=<choose a local staff password>
MODEL_PATH=models/railpulse_eta_model.pkl
MODEL_VERSION=eta-v2
```

The admin and staff accounts are seeded from these values at FastAPI startup.
**Staff accounts cannot be self-registered** — the old staff registration and
OTP endpoints answer `410 Gone` by design. Passengers register themselves.

> **A note on `MONGODB_DB`.** The example uses `railpulse`, which keeps FastAPI
> (auth + ML) and Express (the main site's data) in one database. Some setups
> run FastAPI against `railpulse_eta_ml` instead; then auth and the ML app's
> data live there, while the **main site's** trains, stations, corridors and
> alerts always live in the database `backend/.env`'s `MONGO_URI` points at
> (`railpulse`) — which is where `scripts/seed-demo.js` writes. Either is fine;
> the only rule is that the seed and the Express API read the same database.
> If the main site shows no data after seeding, this mismatch is the first
> thing to check.

### 5. Install and start, in this order

```bash
cd "prediction model/railpulse-backend" && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

The trained model is not committed. Build it from the included dataset — this
must succeed before the ML API will answer predictions:

```bash
cd "prediction model/railpulse-backend" && .venv/bin/python training/train.py
```

It writes a versioned artifact under `models/registry/` and points
`models/latest.json` at it; the API reports which one it loaded at
`/api/v1/health/`. `MODEL_PATH` and `MODEL_VERSION` in `.env` are the legacy
single-file settings and are superseded by that registry.
`python3 -m training.pipeline` is the same thing with flags (`--data`,
`--config`, `--seed`, `--quick`).

By default it trains on `data/indian_railway_delay_data_.csv`: **100 journeys
across 10 trains.** The demo seed in step 7 writes **12** trains, so two of
them — **12621 Tamil Nadu Express** and **12625 Kerala Express** — will not be
in the reference catalogue, and the ML app's route lookup answers 404 for those
two. Their arrival estimates still work; the model simply reports
`trainKnownToModel: false`. To cover all twelve, train on the larger included
file instead:

```bash
cd "prediction model/railpulse-backend" && .venv/bin/python -m training.pipeline --data data/indian_railway_delay_synthetic_552.csv
```

```bash
cd "prediction model/railpulse-backend" && .venv/bin/python -m uvicorn app.main:app --port 8000
```

```bash
cd backend && npm ci && npm run dev
```

```bash
cd frontend/frontend && npm ci && npm run dev
```

The website needs no configuration if everything runs on the ports above. If
any of them differ, copy `frontend/frontend/.env.example` to
`.env.local` and set `VITE_API_BASE_URL`, `VITE_AUTH_BASE_URL` and
`VITE_ML_APP_URL` — and add the website's own origin to `CORS_ORIGINS` in the
FastAPI `.env`, which is compared against exactly what the browser sends.

```bash
cd "prediction model/railpulse-frontend" && python3 -m http.server 3000
```

Expect `Redis connected`, `MongoDB connected`, `Server running on port 5000`
from Node, and `Application startup complete` from FastAPI.

### 6. Create the ML bridge account (once)

The Node→FastAPI bridge signs in as a normal user. Create it with the username
and password you put in `backend/.env`:

```bash
curl -fsS -X POST http://localhost:8000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"username":"ml-bridge","password":"<the ML_SERVICE_PASSWORD you chose>","full_name":"Node ETA bridge"}'
```

Skip this and the site still works, but every ETA silently falls back to a
rule-based estimate (`"predictionSource":"rule-based"`,
`"fallbackReason":"ml_unreachable"`) instead of the model.

### 7. Load the demo data

```bash
cd backend && npm run seed
```

That is a **dry run**: it prints the database, the collections and what it would
write, and changes nothing. To write it:

```bash
cd backend && node scripts/seed-demo.js --apply
```

It writes 20 stations, 4 corridors, 12 trains, 12 train events, 3 alerts and 12
Redis live-state keys. It is idempotent, it never touches `users`, `main_users`,
`live_train_state`, `reference_trains`, `predictions` or FastAPI's `alerts`, and
it creates no accounts. `--apply --reset` removes only rows it wrote
(`dataSource: "SEED"`).

Then, on the ML side, sign in as admin and use **Load reference catalogue** and
**Seed demo trains** on the admin dashboard, or:

```bash
curl -fsS -X POST http://localhost:8000/api/v1/reference/load -H "Authorization: Bearer <an admin token>"
```

### 8. Open it

| What | URL |
|---|---|
| Main website | <http://localhost:5173> |
| ML frontend | <http://localhost:3000> |
| Main API health | <http://localhost:5000/api/health> |
| ML API health | <http://localhost:8000/api/v1/health/> |
| ML API docs | <http://localhost:8000/docs> |

Register a passenger on the main site, or sign in as admin or staff. The same
token works in both applications: the sidebar's **ETA prediction using ML
model** hands the session to the ML frontend, and signing out of the main site
ends both.

### Signing in

| Role | Username | Password | How to get it |
|---|---|---|---|
| Admin | `admin` | `ADMIN_PASSWORD` from the FastAPI `.env` (the example uses `change-me-admin`) | seeded at FastAPI startup |
| Staff | `staff` | `STAFF_PASSWORD` from the FastAPI `.env` (the example uses `change-me-staff`) | seeded at FastAPI startup |
| Passenger | your choice | your choice | **Register** on the main site; staff/admin cannot be self-registered |

> **If admin or staff sign-in returns 401** with *"Invalid username or
> password… please register again"*: the account was seeded earlier under a
> different password. The seed now **self-heals** — on every FastAPI startup it
> realigns the admin/staff password with the current `ADMIN_PASSWORD` /
> `STAFF_PASSWORD` in `.env` — so the usual fix is simply to **restart the
> FastAPI service** (or let `--reload` pick up any change). If you cannot
> restart, reset the stored password directly with the service's own hasher:
>
> ```bash
> cd "prediction model/railpulse-backend"
> .venv/bin/python - <<'RESET'
> import pymongo
> from app.core.security import password_service
> from app.core.config import get_settings
> s = get_settings()
> db = pymongo.MongoClient(s.MONGODB_URI)[s.MONGODB_DB]["users"]
> for name, pw in [("admin", s.ADMIN_PASSWORD), ("staff", s.STAFF_PASSWORD)]:
>     db.update_one({"username": name}, {"$set": {"password_hash": password_service.hash(pw)}})
>     print("reset", name)
> RESET
> ```
>
> Then sign in with the `.env` values. (This reads the DB name and credentials
> straight from your `.env`, so it works whether `MONGODB_DB` is `railpulse` or
> `railpulse_eta_ml` — see the note in step 4.)

---

## Verifying a fresh setup

```bash
curl -fsS http://localhost:5000/api/health
curl -fsS http://localhost:5000/api/stations | head -c 120
curl -fsS http://localhost:5000/api/operations/network
curl -fsS http://localhost:8000/api/v1/health/ | head -c 80
```

The network summary should report 12 trains once the seed is applied. On the
Dashboard you should see 12 active trains, 3 alerts and **all 12 trains on the
map**, over 20 stations. (Earlier builds mapped only 5 and showed a
*"7 trains not shown"* note; the seed now carries coordinates for every station
those trains sit at, so each one is placed. The note still appears, correctly,
only if a train is ever at a station with no coordinate.)

---

## Using the main site

A few things the UI does that are worth knowing:

- **Light / dark theme.** A toggle sits in the top bar (or press `\`). The
  choice is remembered, and the app follows your OS preference on first visit.
- **Keyboard shortcuts.** Press `?` for the full list. Navigation is a chord:
  `g` then a letter (`g d` Dashboard, `g t` Trains, `g m` Map, and so on).
- **Live, but polled.** Every page refreshes on a 15-second poll and shows a
  "last updated" time with a manual **Refresh** button in its header.
- **Honest empty, loading and error states.** A page that has no data says so
  and offers a way forward; it never fills a gap with invented rows.

See [docs/UNIFY_PROGRESS.md](docs/UNIFY_PROGRESS.md) for the full record of the
UI work (a shared component set, motion, the map, page polish and these
showcase touches), newest last.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | the Mongo container publishes no port | `docker ps` and check `PORTS`; recreate with `-p 27017:27017` |
| Sign-in works, then every page 401s and bounces to `/login?expired=1` | `JWT_SECRET` ≠ `JWT_SECRET_KEY` | make them identical, restart both backends |
| ETA says `rule-based` / `ml_unreachable` | the `ml-bridge` account does not exist, or FastAPI is down | step 6, and check `ML_BASE_URL` |
| ETA returns `404 Live state not found` | no Redis live state for that train | `node scripts/seed-demo.js --apply`, or `PUT /api/trains/:id/live-state` |
| Dashboard shows zeroes and "No trains to show" | the seed was never applied | step 7 |
| Map says "No stations are recorded" or Alerts is empty, even after seeding | the main site's data DB (`railpulse`) was cleared, or the seed targeted a different DB than the Express API reads | re-run `node scripts/seed-demo.js --apply` in `backend/`, and check the `MONGODB_DB` note in step 4 |
| Admin or staff sign-in returns 401 | the account was seeded once with a different password; changing `.env` does not update it | run the password reset in **Signing in** above |
| Staff registration or OTP returns `410` | by design (one identity provider) | an admin creates staff accounts |
| CORS error in the browser console | the origin is not in `CORS_ORIGINS` | add it, restart FastAPI |

## Tests

```bash
cd backend && npm test
```

```bash
cd frontend/frontend && npx vite build && npx eslint src
```

```bash
cd "prediction model/railpulse-frontend" && npm test
```

```bash
cd "prediction model/railpulse-backend" && .venv/bin/python -m pytest -q
```

## Data layout

The unified design is **one database, `railpulse`**, holding both sets of
collections. FastAPI owns `users`, `alerts`, `predictions`, `reference_trains`,
`live_train_state` and `simulation_states`. Express owns `trains`,
`trainevents`, `journeys`, `simulations`, `etapredictions`, `riskassessments`,
`bottlenecks`, `propagations`, `recoveries`, plus `main_users`, `main_alerts`,
`main_stations` and `main_corridors` — the `main_` prefix exists because those
four names would otherwise collide with FastAPI's.

When FastAPI's `MONGODB_DB` is set to `railpulse_eta_ml` (see the note in step
4), its collections live in that database instead, and only the `main_*`,
`trains`, `trainevents` and the other Express-owned collections remain in
`railpulse`. The main website reads `railpulse` for its data either way, which
is where the seed writes.

`railpulse_node` is the database Express used before the services were unified.
Nothing reads or writes it; it is kept as a backup and is a pending cleanup
decision.

Back everything up before any destructive step:

```bash
docker exec railpulse-mongo mongodump --uri="mongodb://127.0.0.1:27017" --out=/tmp/rp && docker cp railpulse-mongo:/tmp/rp "backups/$(date +%Y%m%d-%H%M%S)"
```

`backups/` is gitignored.

## Known honest limits

- **Not live tracking.** The main site polls every 15 seconds and pauses while
  the browser tab is hidden. The server emits Socket.IO events that no client
  listens to yet.
- **All twelve demo trains are mapped.** The seed carries coordinates for 20
  stations, which covers every station the demo trains sit at; the seven added
  stations were looked up on OpenStreetMap (see
  [docs/UNIFY_PROGRESS.md](docs/UNIFY_PROGRESS.md)). If a train is ever at a
  station with no coordinate, the map still leaves it off and says how many and
  why, rather than guessing a point.
- **A seeded train's route has two stops**, its real source and destination from
  the dataset. The dataset contains no intermediate stop sequence, so none is
  invented, and route progress therefore reads 0% until a train moves.
- **The model is trained on synthetic data** (552 journeys, 12 trains), which
  every prediction surface states.
- **Resolving an alert on the main site is session-local.** The stored alert has
  no status field, so it is not persisted and does not survive a reload.
- **Signing out does not revoke a token server-side.** A copy taken beforehand
  stays valid until it expires, 60 minutes after it was issued.

## Security notes

Never commit `.env`, credentials, `node_modules`, `.venv`, model binaries,
`backups/` or build output. Both `.env` files hold a shared signing secret;
rotating it means updating both and signing everyone out.

**Every `/api` route requires a verified token**, except `GET /api/health` and
the retired identity endpoints, which answer `410 Gone`. Reads are open to any
signed-in role. Writes on trains, train-events, alerts and journeys, and
everything under `/api/simulation` and `/api/operations`, require **STAFF or
ADMIN**. The two exceptions are `GET /api/operations/network` (the dashboard
summary every role sees) and `POST /api/journey/plan` (a passenger search). The
whole rule is one file, `backend/middleware/apiGuard.js`, with its table in
`backend/tests/apiGuard.test.js`. Socket.IO is not covered by it.

## Documentation

- [docs/UNIFY_PROGRESS.md](docs/UNIFY_PROGRESS.md) — every phase, decision and
  measurement of the unification work, newest last
- [docs/AUDIT_PHASE2.md](docs/AUDIT_PHASE2.md) — the audit findings and their IDs
- [docs/UI_PROGRESS.md](docs/UI_PROGRESS.md), [docs/UI_FINAL_REPORT.md](docs/UI_FINAL_REPORT.md) — the ML frontend UI work
- [docs/SETUP_GUIDE_ARCHIVE.md](docs/SETUP_GUIDE_ARCHIVE.md) — the previous
  setup guide, kept for reference; parts of it are now out of date, and this
  file supersedes it
