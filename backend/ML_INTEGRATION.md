# ML ETA integration (Node ⇄ FastAPI)

The Node API serves `GET /api/trains/:id/eta`. It now asks the FastAPI delay
model first and falls back to the original rule-based estimate whenever the
model cannot answer. The browser never talks to the ML service.

```
Browser ──JWT (Node)──► Node :5000 ──service JWT (Python)──► FastAPI :8000
                           └── rule-based ETA (fallback, unchanged)
```

## Environment

Add to `backend/.env`:

```dotenv
ML_ENABLED=true
ML_BASE_URL=http://localhost:8000/api/v1
ML_SERVICE_USERNAME=ml-bridge
ML_SERVICE_PASSWORD=<choose-a-local-password>
ML_TIMEOUT_MS=2500
```

`ML_ENABLED=false` is a kill switch: the bridge then makes no network call at
all and every ETA is rule-based.

## One-time: create the service account

The ML service has its own user store, so Node authenticates with a dedicated
least-privilege account (PASSENGER role — `/predict/eta` only requires an
authenticated user). With FastAPI running:

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"ml-bridge","password":"<same-as-ML_SERVICE_PASSWORD>"}'
```

If the account is missing or the password is wrong, the bridge reports
`ml_auth_failed` and the ETA silently falls back — it never 500s.

## Behaviour

| Condition | ETA source | `fallbackReason` |
|---|---|---|
| model answers 200 | `ml` | — |
| model returns 503 (no model registered) | `rule-based` | `model_unavailable` |
| request exceeds `ML_TIMEOUT_MS` | `rule-based` | `ml_timeout` |
| service unreachable | `rule-based` | `ml_unreachable` |
| 401 after one retry | `rule-based` | `ml_auth_failed` |
| 422 (payload rejected) | `rule-based` | `ml_rejected_payload` |
| `ML_ENABLED=false` | `rule-based` | `disabled` |

Exactly one `ETAPrediction` document is written per request, whichever path ran.

## Response additions

All additive — existing fields keep their meaning and position:

| Field | Meaning |
|---|---|
| `predictionSource` | `"ml"` or `"rule-based"` |
| `fallbackReason` | why the model was not used |
| `delayP10Minutes`, `delayP50Minutes`, `delayP90Minutes` | model delay quantiles |
| `probabilityDelayOver15` | calibrated P(delay > 15 min) |
| `delayCategory` | model band (`ON_TIME`…`SEVERE`) |
| `trainKnownToModel` | false ⇒ cold start, route-level fallbacks used |
| `dataProvenance` | `synthetic` for the current model |
| `beatsBaseline` | whether the model beat its baseline on held-out data |
| `modelStatus` | per-request description of which engine answered (not persisted) |

`riskLevel` stays within the existing `LOW/MEDIUM/HIGH` enum: the model's
`MODERATE` is mapped to `MEDIUM`. `confidenceMinutes`, previously hardcoded to
10, is `(P90 − P10) / 2` when the model answers.

## Auth

`GET /api/trains/:id/eta` now requires a Node JWT (any role). The React app
already sends it through the `api.js` interceptor. Unauthenticated callers
receive 401.

## Tests

```bash
cd backend && npm test
```

14 tests drive a stub ML server on a real port and cover every row of the
fallback table, token caching, the single 401 retry, and the payload contract.
No test depends on MongoDB, Redis or a running ML service.
