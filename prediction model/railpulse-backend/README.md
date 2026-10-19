# RailPulse FastAPI ML Backend

This is a FastAPI ML subsystem for dynamic railway ETA forecasting and delay prediction.
It uses FastAPI + Pydantic as the backend application layer and MongoDB for persistence, matching the SIH26028 specifications.

## Architecture Highlights
- **Single Backend Framework**: Uses FastAPI to handle API contracts, validation, model inference, prediction history, and model status.
- **Strict Data Contracts**: Uses Pydantic v2 to validate train states, predict endpoints, and output payload.
- **Machine Learning**: Delay regression with LightGBM quantile models (P10/P50/P90) plus a calibrated probability classifier, selected by chronological cross-validation against explicit baselines. Everything runs inside one `scikit-learn` `Pipeline` so preprocessing is identical at fit and serve time.
- **Persistence**: Integrates `MongoDB` (via `motor`) for storing prediction logs, live train state, and features.

## Setup Instructions

### 1. Prerequisites
- Python 3.10+
- MongoDB instance running

### 2. Install Dependencies
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Training the Model
The provided `indian_railway_delay_data_.csv` holds 100 historical train-level arrival records for 10 trains. The pipeline cleans it deterministically, splits chronologically by journey date, selects a model by expanding-window cross-validation and registers a versioned artifact.

```bash
python3 -m training.pipeline
```

This writes `models/registry/<version>/model.joblib` plus `metadata.json`, and repoints `models/latest.json`. `python3 training/train.py` remains as a thin wrapper. Flags: `--data`, `--config`, `--seed`, `--quick`, `--no-profile`.

**Measured result on this dataset:** the model does not beat a constant mean-delay baseline on the held-out test set (MAE 28.72 vs 25.46 minutes). See `docs/MODEL_CARD.md` and `reports/model_comparison.md`; `/health` reports `beats_baseline: false`.

To retrain on a different dataset, copy `configs/dataset.default.json`, edit the column map and feature lists, and pass `--config`. No code change is needed.

### 4. Configure Environment
Copy `.env.example` to `.env` and adjust the MongoDB connection string.
```bash
cp .env.example .env
```

### 5. Run the Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API Endpoints
- `GET /api/v1/health/`: Application, database and model health, plus dataset provenance and measured model quality (`beats_baseline`).
- `GET /api/v1/docs/capabilities`: Capability catalog, including future-data requirements.
- `POST /api/v1/auth/register`: Passenger registration.
- `POST /api/v1/auth/login`: JWT login.
- `GET /api/v1/auth/me`: Authenticated user details.
- `POST /api/v1/predict/eta`: ETA + delay prediction. Returns delay quantiles (`delay_p10/p50/p90_minutes`), `p_delay_gt_15`, `delay_category`, `risk_level`, `model_quality` and `unsupported_fields_ignored`. All v2 fields are retained.
- `POST /api/v1/simulation/update`: Endpoint to feed simulated live updates.
- `GET /api/v1/trains/{train_number}/state`: Current stored live state for a train.
- `GET /api/v1/trains/{train_number}/predictions/latest`: Latest prediction for a train.
- `GET /api/v1/trains/{train_number}/predictions`: Paginated prediction history.
- `PUT /api/v1/trains/{train_number}/state`: Staff/admin live-state ingestion.
- `GET /api/v1/reference/trains?q=`: Train search / autocomplete.
- `GET /api/v1/reference/stations?q=`: Station search / autocomplete.
- `GET /api/v1/reference/trains/{train_number}/route`: Origin and destination for a train.
- `POST /api/v1/reference/load`: Admin-only, idempotent load of the reference catalogue from the cleaned dataset.
- `GET /api/v1/trains/{train_number}/upcoming-stations`: Destination ETA from the model. Intermediate stops are not in the dataset and are not inferred.
- `GET /api/v1/network/trains/{train_number}/delay-propagation`: Delay propagation contract. Requires live network data.
- `GET /api/v1/network/trains/{train_number}/operational-risk`: Operational risk contract. Requires live network data.
- `GET /api/v1/alerts`: Stored alert query. Alert generation requires live events and rules.

FastAPI's interactive documentation is available at `/docs`; the OpenAPI schema is available at `/openapi.json`.

### Data boundaries

The CSV contains train-level historical arrival and delay observations. It does not contain station sequences, live positions, section occupancy, junction conflicts or operational events. Accordingly, intermediate-station ETA, delay propagation, operational-risk analysis and generated alerts return an explicit `future_data_required` status with empty result arrays instead of fabricated data.

Thirteen request fields (`current_delay_minutes`, `current_speed_kmph`, `track_occupancy`, `trains_in_section`, …) have no counterpart in the training data. They are accepted for forward compatibility, ignored by the model, and listed back in `unsupported_fields_ignored`.

Simulation writes are stored in the `simulation_states` collection and never overwrite `live_train_state`. The live-state ingestion endpoint is reserved for staff/admin callers and is ready for a future operational feed.

## Running Tests
```bash
pytest tests/
```

Covers cleaning reconciliation, the shared feature contract, split leakage, the predictor contract, API routes, and a contract test asserting every frontend `api.*` call exists in `/openapi.json`. Model-dependent tests skip when no artifact is registered.

End-to-end check against a running server and MongoDB:
```bash
python3 scripts/e2e_check.py
```

### Production configuration

Set `ENVIRONMENT=production`, provide a random `JWT_SECRET_KEY` of at least 32 characters, replace both seed passwords, and set `CORS_ORIGINS` to a comma-separated allowlist. The application uses Argon2 password hashing, expiring JWTs, role checks, bounded MongoDB connection timeouts, and validates the model feature contract when the artifact is loaded. No default development secrets are accepted in production. Startup degrades rather than crashing when MongoDB or the model is unavailable; `/health` reports the condition.

An optional plain-language explanation layer is available behind `RAILPULSE_EXPLANATIONS_ENABLED=true` (off by default). It only restates numbers the model returned and never produces a prediction.

The test suite uses fake database adapters for deterministic API tests. A live MongoDB integration run requires a MongoDB instance configured through `MONGODB_URI`; it is not silently treated as passed when unavailable.
