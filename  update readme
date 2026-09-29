# RailPulse 2026 - Full Setup and Handoff Guide

RailPulse contains two related applications:

1. **Main RailPulse website:** React/Vite frontend, Express API, MongoDB and Redis.
2. **ETA model application:** static HTML/CSS/JavaScript frontend, FastAPI backend, MongoDB and an XGBoost model trained from the included dataset.

The model frontend is a separate application. The main website's **ETA prediction using ML model** sidebar item opens it at `http://localhost:3000`. The regular **ETA Prediction** item continues to open the main site's own ETA page.

## Requirements

Install these before setup:

- Git
- Docker Engine or Docker Desktop, with `docker` available in the terminal
- Node.js **20.19+** or **22.12+**, and npm
- Python **3.10+** and `python3`
- OpenSSL (`openssl`) for generating the main API's JWT secret
- `curl` for health checks; `zip` and `unzip` for ZIP packaging and verification

Vite in the main frontend requires Node 20.19+ or 22.12+. Use a supported current Node LTS release. These commands are written for Linux/macOS shells. Windows users can use WSL for the Docker, shell, and ZIP commands.

## Project Layout and Ports

| Service | Project directory | Local address |
| --- | --- | --- |
| Main React website | `frontend/frontend` | `http://localhost:5173` |
| Main Express API | `backend` | `http://localhost:5000` |
| ML model frontend | `prediction model/railpulse-frontend` | `http://localhost:3000` |
| ML FastAPI backend | `prediction model/railpulse-backend` | `http://localhost:8000` |
| MongoDB | Docker container | `mongodb://127.0.0.1:27017` |
| Redis | Docker container | `redis://127.0.0.1:6379` |

Ports 27017, 6379, 3000, 5000, 5173, and 8000 must be available. Do not run `npm install` from the workspace root: the root is not a Node project. Each Node app has its own lockfile; use `npm ci` in its directory.

## 1. Start MongoDB and Redis with Docker

No application Compose file is required. Start the database containers from a terminal:

```bash
docker run -d \
  --name railpulse-mongo-dev \
  --restart unless-stopped \
  -p 27017:27017 \
  -v railpulse-mongo-dev-data:/data/db \
  mongo:7

docker run -d \
  --name railpulse-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  redis:7-alpine
```

MongoDB data persists in the Docker volume `railpulse-mongo-dev-data` when the container is stopped. Redis data is disposable for this development setup.

If Docker reports that a container name is already in use, start the existing containers instead of creating duplicates:

```bash
docker start railpulse-mongo-dev railpulse-redis
```

Check the services:

```bash
docker ps --filter name=railpulse-mongo-dev --filter name=railpulse-redis
docker exec railpulse-mongo-dev mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
docker exec railpulse-redis redis-cli ping
```

The expected database responses are `{ ok: 1 }` and `PONG`.

## 2. Configure and Start the Main Express Backend

The main backend requires `MONGO_URI` and `JWT_SECRET`. Redis defaults to `redis://localhost:6379`, but the explicit value below documents the local setup.

Create `backend/.env` from the project root. This file is intentionally not committed:

```bash
cd backend
cat > .env <<EOF
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/railpulse
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=$(openssl rand -hex 32)
EOF
npm ci
npm run dev
```

Keep this terminal running. On startup, expect `Redis connected`, `MongoDB connected`, and `Server running on port 5000`. The `.env` command uses `openssl` to generate a local JWT signing secret; do not publish the `.env` file.

In a second terminal, verify the API:

```bash
curl -fsS http://localhost:5000/api/health
```

Expected response:

```json
{"status":"ok"}
```

### Optional staff email verification

Passenger registration and login do not require email configuration. Staff OTP email delivery does. To enable it, add `EMAIL_USER` and `EMAIL_PASS` to `backend/.env`, using a Gmail address and a Google App Password (not the Gmail account password). Keep those values private and restart the backend. Staff registration is also restricted to employee IDs and addresses configured in `backend/src/config/staffVerification.js`.

## 3. Start the Main React Website

In another terminal, from the project root:

```bash
cd frontend/frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173`. The main frontend's API URL is configured in `frontend/frontend/src/services/api.js` and defaults to `http://localhost:5000/api`.

The root route opens passenger registration. Register a passenger account, then use the login page. A new database has no user or train records by default.

## 4. Add Main-App Demo Train Data

The Express app has no automatic demo-data seed command. On a fresh database, add one demonstration train and one event so the train list, dashboard, live-state-backed ETA, and current Alerts page have data. Run this once from a terminal with the main API running:

```bash
TRAIN_ID=6a9d5a64a663314c1afeaa69

curl -fsS -X POST http://localhost:5000/api/trains \
  -H 'Content-Type: application/json' \
  -d '{
    "_id": "6a9d5a64a663314c1afeaa69",
    "trainNumber": "12951",
    "trainName": "Demo Rajdhani",
    "trainType": "EXPRESS",
    "source": "New Delhi",
    "destination": "Mumbai Central",
    "currentStation": "New Delhi",
    "status": "RUNNING",
    "isActive": true,
    "route": [
      { "station": "New Delhi", "sequence": 0, "scheduledArrival": "18:00", "scheduledDeparture": "18:05", "distanceFromPrevious": 0 },
      { "station": "Surat", "sequence": 1, "scheduledArrival": "23:00", "scheduledDeparture": "23:05", "distanceFromPrevious": 900 },
      { "station": "Mumbai Central", "sequence": 2, "scheduledArrival": "23:59", "scheduledDeparture": "23:59", "distanceFromPrevious": 260 }
    ]
  }'

curl -fsS -X POST http://localhost:5000/api/train-events \
  -H 'Content-Type: application/json' \
  -d "{
    \"trainId\": \"$TRAIN_ID\",
    \"station\": \"New Delhi\",
    \"location\": \"New Delhi station\",
    \"speed\": 80,
    \"delayMinutes\": 5,
    \"eventType\": \"LOCATION_UPDATE\"
  }"
```

Creating the event also writes the train's current state into Redis. The fixed demo ID matches the train ID currently used by the main site's Alerts page. Run this seed only once against a fresh main database; a repeat will fail because train IDs and train numbers are unique. These records are synthetic demonstration data, not live railway telemetry.

Verify main-app data:

```bash
curl -fsS http://localhost:5000/api/trains
curl -fsS http://localhost:5000/api/train-events
curl -fsS "http://localhost:5000/api/trains/$TRAIN_ID/eta"
```

The ETA endpoint needs the MongoDB train, a route containing the current and destination stations, and the Redis live state created by the event request.

## 5. Configure and Prepare the ML Model Backend

The model repository is already included at `prediction model/`; do not clone it again when using this project ZIP. Its MongoDB database is separate from the main app's database.

Create a Python virtual environment inside the model backend and install the locked-by-requirements dependencies:

```bash
cd "prediction model/railpulse-backend"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
```

Open `prediction model/railpulse-backend/.env` and set local development values. The minimum values for this combined project are:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=railpulse_eta_ml
MODEL_PATH=models/railpulse_eta_model.pkl
MODEL_VERSION=eta-v2
ENVIRONMENT=development
API_PREFIX=/api/v1
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
JWT_SECRET_KEY=<replace-with-a-random-secret-of-at-least-32-characters>
ACCESS_TOKEN_EXPIRE_MINUTES=60
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<choose-a-private-local-admin-password>
STAFF_USERNAME=staff
STAFF_PASSWORD=<choose-a-private-local-staff-password>
```

Generate a suitable local secret with `python -c 'import secrets; print(secrets.token_hex(32))'` while the virtual environment is active, then replace the placeholder. Choose private local passwords for the model app's seeded Admin and Staff accounts. These are separate from the main site's passenger accounts. Never share the populated `.env` file.

The trained model binary is intentionally excluded from Git. While still in `prediction model/railpulse-backend` with its virtual environment active, train it from the included CSV:

```bash
python training/train.py
```

This writes the ignored artifact `models/railpulse_eta_model.pkl` and prints validation/test metrics. A successful run is required before starting the model API. Training metrics are for this demonstration dataset and are not a certification of real-world railway accuracy.

### Windows PowerShell

Use `py -3 -m venv .venv`, activate with `.venv\Scripts\Activate.ps1` from `railpulse-backend`, and then run `python -m pip install -r requirements.txt` and `python training/train.py`. If PowerShell prevents activation, open a new terminal with an approved execution policy or use WSL.

## 6. Start the ML API and Frontend

Start the model API in one terminal. From the `prediction model/railpulse-backend` directory, with `.venv` activated and `.env` configured:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The API uses MongoDB database `railpulse_eta_ml`; it does not read or overwrite the main app's `railpulse` database. Check model, API, and database readiness:

```bash
curl -fsS http://localhost:8000/api/v1/health/
```

The JSON should report `"status":"ok"`, `"mongodb":"ok"`, and `"model":"ok"`. API docs are at `http://localhost:8000/docs`.

Start the static model frontend in a separate terminal:

```bash
cd "prediction model/railpulse-frontend"
python3 -m http.server 3000 --bind 127.0.0.1
```

Open `http://localhost:3000` directly to test the ML application. Its API client defaults to `http://localhost:8000/api/v1`; the FastAPI CORS allowlist above permits this origin. The main website's **ETA prediction using ML model** sidebar link opens this frontend.

## 7. Start Order and Stop

Start in this order:

1. MongoDB and Redis Docker containers.
2. Main Express backend.
3. Main Vite website.
4. Model FastAPI backend (after installing its dependencies and training the model).
5. Static model frontend.

Keep each foreground server running in its own terminal. Stop each Node/Python server with `Ctrl+C`. The databases can be stopped without deleting persistent MongoDB data:

```bash
docker stop railpulse-mongo-dev railpulse-redis
```

Start them next time with:

```bash
docker start railpulse-mongo-dev railpulse-redis
```

Do not run `docker volume rm railpulse-mongo-dev-data` unless you intentionally want to delete the main MongoDB data. The model data is in the separate Mongo database `railpulse_eta_ml` in that same volume.

## Troubleshooting

- **Docker reports a name conflict:** run `docker start railpulse-mongo-dev railpulse-redis`, then check `docker ps`.
- **MongoDB or Redis connection refused:** check container status, then run the corresponding `mongosh` ping or `redis-cli ping` command above.
- **Main API exits with `MONGO_URI is not configured`:** create `backend/.env` as described and run `npm run dev` from `backend/`.
- **Main API reports Redis connection errors:** ensure the Redis container is running and `REDIS_URL=redis://127.0.0.1:6379` is set in `backend/.env`.
- **Frontend cannot reach the main API:** check that Express is on port 5000 and Vite is on port 5173; the main API base URL is in `frontend/frontend/src/services/api.js`.
- **Model API says the model is unavailable:** activate its `.venv`, train from `prediction model/railpulse-backend` and confirm `models/railpulse_eta_model.pkl` exists.
- **Model frontend says FastAPI is offline or CORS fails:** check port 8000 and the API health URL. `CORS_ORIGINS` must include the exact static frontend origin, `http://localhost:3000`.
- **Port is already occupied:** stop the process using that port before starting the service. Keep the documented ports together so configured API URLs remain correct.
- **Train/ETA screens are empty on a fresh database:** register a passenger and run the one-time main demo-data commands above. The main app does not seed trains automatically.
- **ML prediction page has no train state:** the ML database is separate. Its backend has a staff/admin demo seed feature; sign in with credentials configured in its `.env` and use its UI demo controls, or use the documented simulation endpoint.
- **Staff OTP does not send:** configure `EMAIL_USER` and a Gmail App Password as described; passenger login does not depend on mail.

## Prepare a Clean ZIP for Handoff

The ZIP should contain source, `package.json` and lockfiles, `.gitignore`, `.env.example`, and the model CSV. It should not contain installed dependencies, secrets, Git history, generated model binaries, build output, or local databases. Run these commands from the project root on Linux/macOS:

```bash
zip -r ../RailPulse-2026.zip . \
  -x '.git/*' '*/.git/*' \
     'node_modules/*' '*/node_modules/*' \
     '.venv/*' '*/.venv/*' '*/venv/*' \
     'backend/.env' 'prediction model/railpulse-backend/.env' \
     '*/.env.local' '*/.env.production' \
     'prediction model/railpulse-backend/models/*.pkl' \
    'dist/*' 'frontend/frontend/dist/*' '*/dist/*' '.dist/*' \
     '*.log' '*.zip'
```

The `.env.example` file is kept in the ZIP so the ML app can be configured after extraction. The main backend has no `.env.example`; its complete required `.env` template is in Section 2. Do not include the real `backend/.env` or model backend `.env`.

Verify the archive before sharing it:

```bash
if unzip -l ../RailPulse-2026.zip | grep -E '(^|/)(node_modules|\.venv|venv|\.git|dist)/|(^|/)\.env$|\.pkl$'; then
  echo 'Unexpected local or generated files found; inspect the matches before sharing.'
else
  echo 'No dependency folders, local .env files, Git internals, build output, or model binaries found.'
fi
```

Inspect any reported match before sharing. A recipient should extract the ZIP and follow this guide from Section 1. They must install dependencies, create private `.env` files, and train the model locally; these files are deliberately not transferred.

## Important Data and Security Notes

- Both backends use local development/demo data; neither is connected to a certified live railway feed.
- The main app's user database and the model app's auth database are separate. Register a passenger for the main site. Configure the model app's Admin/Staff seed passwords in its private `.env`.
- Never share `.env`, passwords, JWT secrets, Gmail App Passwords, database credentials, or authentication tokens in a ZIP or repository.
- Do not use the local development credentials or services as a production deployment.
