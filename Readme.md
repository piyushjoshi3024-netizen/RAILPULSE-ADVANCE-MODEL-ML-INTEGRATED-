# RailPulse 2026

RailPulse is a railway operations and ETA demonstration project. It contains the main React/Express application and a separate FastAPI/XGBoost ETA model application.

## Quick Start

Requirements: Git, Docker Engine or Docker Desktop, Node.js 20.19+ (or 22.12+), npm, Python 3.10+, OpenSSL, and `zip` for creating a Linux ZIP archive.

From the project root, start the local databases:

```bash
docker run -d --name railpulse-mongo-dev --restart unless-stopped \
  -p 27017:27017 -v railpulse-mongo-dev-data:/data/db mongo:7
docker run -d --name railpulse-redis --restart unless-stopped \
  -p 6379:6379 redis:7-alpine
```

If either named container already exists but is stopped, start it with `docker start railpulse-mongo-dev railpulse-redis`.

Follow the complete setup guide in the project-root file named ` update readme` for environment configuration, dependency installation, demo data, all four application processes, health checks, troubleshooting, and safe ZIP packaging.

## Local URLs

- Main React website: `http://localhost:5173`
- Main Express API health: `http://localhost:5000/api/health`
- ML model frontend: `http://localhost:3000`
- ML FastAPI health: `http://localhost:8000/api/v1/health/`
- ML FastAPI docs: `http://localhost:8000/docs`

The main website's **ETA prediction using ML model** sidebar item opens the separate ML frontend. Its regular **ETA Prediction** item remains part of the main app.

## Data and Security

Both applications share one MongoDB database, `railpulse`, on the `railpulse-mongo` container. FastAPI owns `users`, `alerts`, `predictions`, `reference_trains`, `live_train_state` and `simulation_states`. The Express API writes its own collections alongside them, and the two whose default names would have collided are given explicit ones: `main_users` and `main_alerts`. `railpulse_node`, the database the Express API used before, is kept untouched as a backup and is no longer read or written by anything. Redis is still used by the main backend for live train state. Demo trains are synthetic and are not real-time railway data.

Create local `.env` files from the instructions in the detailed guide. Never include `.env` files, credentials, virtual environments, `node_modules`, generated model binaries, or build output in a ZIP shared with others. The ML model artifact is generated locally from the included CSV during setup.
