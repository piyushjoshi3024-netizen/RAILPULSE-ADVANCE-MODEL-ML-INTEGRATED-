"""End-to-end exercise of every route the frontend uses against a live server."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import httpx

BASE = "http://127.0.0.1:8000/api/v1"
results: list[tuple[str, str, int, str]] = []


def record(method: str, path: str, response, note: str = "") -> None:
    results.append((method, path, response.status_code, note))


def main() -> int:
    with httpx.Client(timeout=30.0) as client:
        health = client.get(f"{BASE}/health/")
        record("GET", "/health/", health, health.json().get("status", ""))

        login = client.post(f"{BASE}/auth/login", json={"username": "admin", "password": "change-me-admin"})
        record("POST", "/auth/login", login)
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        record("GET", "/auth/me", client.get(f"{BASE}/auth/me", headers=headers))
        register = client.post(f"{BASE}/auth/register",
                               json={"username": f"e2e{datetime.now(timezone.utc).strftime('%H%M%S')}",
                                     "password": "correct-password"})
        record("POST", "/auth/register", register)

        record("POST", "/reference/load", client.post(f"{BASE}/reference/load", headers=headers))
        record("GET", "/reference/trains", client.get(f"{BASE}/reference/trains?q=&limit=5", headers=headers))
        record("GET", "/reference/stations", client.get(f"{BASE}/reference/stations?q=del", headers=headers))
        record("GET", "/reference/trains/{n}/route",
               client.get(f"{BASE}/reference/trains/12301/route", headers=headers))

        seed = client.post(f"{BASE}/demo/seed", headers=headers)
        record("POST", "/demo/seed", seed, f"{seed.json().get('seeded_count')} trains")
        record("POST", "/demo/refresh", client.post(f"{BASE}/demo/refresh", headers=headers))

        trains = client.get(f"{BASE}/trains", headers=headers)
        record("GET", "/trains", trains, f"{trains.json().get('count')} rows")

        state = client.get(f"{BASE}/trains/12301/state", headers=headers)
        record("GET", "/trains/{n}/state", state)
        payload = {k: v for k, v in state.json().items()
                   if k not in {"_id", "state_source", "updated_at", "simulated_at"}}

        prediction = client.post(f"{BASE}/predict/eta", headers=headers, json=payload)
        body = prediction.json()
        record("POST", "/predict/eta", prediction,
               f"P50={body.get('delay_p50_minutes', 0):.1f}min p>15={body.get('p_delay_gt_15', 0):.2f}")

        record("GET", "/trains/{n}/predictions",
               client.get(f"{BASE}/trains/12301/predictions?limit=50&skip=0", headers=headers))
        record("GET", "/trains/{n}/predictions/latest",
               client.get(f"{BASE}/trains/12301/predictions/latest", headers=headers))
        upcoming = client.get(f"{BASE}/trains/12301/upcoming-stations", headers=headers)
        record("GET", "/trains/{n}/upcoming-stations", upcoming, upcoming.json().get("status", ""))
        record("PUT", "/trains/{n}/state",
               client.put(f"{BASE}/trains/12301/state", headers=headers, json=payload))

        record("POST", "/simulation/update", client.post(f"{BASE}/simulation/update", headers=headers, json={
            "train_number": "12301", "current_timestamp": datetime.now(timezone.utc).isoformat(),
            "destination": "New Delhi", "current_delay_minutes": 12,
        }))

        alerts = client.get(f"{BASE}/alerts?limit=50", headers=headers)
        record("GET", "/alerts", alerts, alerts.json().get("status", ""))
        record("GET", "/docs/capabilities", client.get(f"{BASE}/docs/capabilities"))
        record("GET", "/network/{n}/delay-propagation",
               client.get(f"{BASE}/network/trains/12301/delay-propagation", headers=headers))
        record("GET", "/network/{n}/operational-risk",
               client.get(f"{BASE}/network/trains/12301/operational-risk", headers=headers))
        record("POST", "/demo/reset", client.post(f"{BASE}/demo/reset", headers=headers))

        # Negative paths
        record("GET", "/trains (no auth)", client.get(f"{BASE}/trains"), "expect 401")
        record("POST", "/predict/eta (bad body)",
               client.post(f"{BASE}/predict/eta", headers=headers, json={"train_number": "x"}), "expect 422")
        record("GET", "/trains/00000/state", client.get(f"{BASE}/trains/00000/state", headers=headers),
               "expect 404")

    print(f"{'METHOD':<7} {'PATH':<36} {'STATUS':<7} NOTE")
    print("-" * 86)
    failures = 0
    for method, path, status, note in results:
        expected_ok = status < 400 or "expect" in note
        if "expect 401" in note and status != 401: expected_ok = False
        if "expect 422" in note and status != 422: expected_ok = False
        if "expect 404" in note and status != 404: expected_ok = False
        flag = "" if expected_ok else "   <-- UNEXPECTED"
        failures += 0 if expected_ok else 1
        print(f"{method:<7} {path:<36} {status:<7} {note}{flag}")
    print("-" * 86)
    print(f"{len(results)} calls, {failures} unexpected")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
