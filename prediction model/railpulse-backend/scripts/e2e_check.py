"""Exercise every route the frontend uses, as the correct roles, against a live server.

    python3 scripts/e2e_check.py [--base-url http://127.0.0.1:8000/api/v1]

Prints a `route | method | role | status | OK?` table and exits non-zero if any
call deviates from its expected status.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

DEFAULT_BASE = "http://127.0.0.1:8000/api/v1"
ADMIN = ("admin", "change-me-admin")
STAFF = ("staff", "change-me-staff")


@dataclass
class Check:
    route: str
    method: str
    role: str
    status: int
    expected: int | tuple[int, ...]
    note: str = ""

    @property
    def ok(self) -> bool:
        expected = self.expected if isinstance(self.expected, tuple) else (self.expected,)
        return self.status in expected


class EndToEndChecker:
    """Drives the API as anonymous, passenger, staff and admin callers."""

    def __init__(self, base_url: str = DEFAULT_BASE) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=60.0)
        self.checks: list[Check] = []

    def record(self, route, method, role, response, expected=200, note="") -> httpx.Response:
        self.checks.append(Check(route, method, role, response.status_code, expected, note))
        return response

    def headers(self, username: str, password: str) -> dict[str, str]:
        response = self.client.post(f"{self.base_url}/auth/login",
                                    json={"username": username, "password": password})
        response.raise_for_status()
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def run(self) -> int:
        base = self.base_url
        client = self.client
        stamp = datetime.now(timezone.utc).strftime("%H%M%S%f")[:10]

        # --- anonymous ---
        self.record("/health/", "GET", "anon", client.get(f"{base}/health/"))
        self.record("/docs/capabilities", "GET", "anon", client.get(f"{base}/docs/capabilities"))
        self.record("/trains", "GET", "anon", client.get(f"{base}/trains"), 401, "must be rejected")
        self.record("/predict/eta", "POST", "anon",
                    client.post(f"{base}/predict/eta", json={}), 401, "must be rejected")

        # --- registration + passenger ---
        passenger = f"e2e{stamp}"
        self.record("/auth/register", "POST", "anon",
                    client.post(f"{base}/auth/register",
                                json={"username": passenger, "password": "correct-password"}), 201)
        passenger_headers = self.headers(passenger, "correct-password")
        self.record("/auth/login", "POST", "passenger",
                    client.post(f"{base}/auth/login",
                                json={"username": passenger, "password": "correct-password"}))
        self.record("/auth/me", "GET", "passenger", client.get(f"{base}/auth/me", headers=passenger_headers))
        self.record("/demo/seed", "POST", "passenger",
                    client.post(f"{base}/demo/seed", headers=passenger_headers), 403, "RBAC: staff/admin only")
        self.record("/simulation/update", "POST", "passenger",
                    client.post(f"{base}/simulation/update", headers=passenger_headers, json={
                        "train_number": "12301", "current_timestamp": datetime.now(timezone.utc).isoformat(),
                        "destination": "New Delhi"}), 403, "RBAC: staff/admin only")
        self.record("/network/trains/{n}/operational-risk", "GET", "passenger",
                    client.get(f"{base}/network/trains/12301/operational-risk", headers=passenger_headers),
                    403, "RBAC: staff/admin only")

        # --- admin setup ---
        admin_headers = self.headers(*ADMIN)
        self.record("/reference/load", "POST", "admin",
                    client.post(f"{base}/reference/load", headers=admin_headers))
        seed = self.record("/demo/seed", "POST", "admin",
                           client.post(f"{base}/demo/seed", headers=admin_headers))
        seeded = seed.json().get("seeded_count", 0)
        self.checks[-1].note = f"{seeded} trains from the dataset"

        # --- staff ---
        staff_headers = self.headers(*STAFF)
        self.record("/demo/refresh", "POST", "staff",
                    client.post(f"{base}/demo/refresh", headers=staff_headers))
        self.record("/simulation/update", "POST", "staff",
                    client.post(f"{base}/simulation/update", headers=staff_headers, json={
                        "train_number": "12301", "current_timestamp": datetime.now(timezone.utc).isoformat(),
                        "destination": "New Delhi", "current_delay_minutes": 12}))
        self.record("/network/trains/{n}/delay-propagation", "GET", "staff",
                    client.get(f"{base}/network/trains/12301/delay-propagation", headers=staff_headers))
        self.record("/network/trains/{n}/operational-risk", "GET", "staff",
                    client.get(f"{base}/network/trains/12301/operational-risk", headers=staff_headers))

        # --- passenger read paths (the main frontend flow) ---
        trains = self.record("/trains", "GET", "passenger",
                             client.get(f"{base}/trains", headers=passenger_headers))
        self.checks[-1].note = f"{trains.json().get('count')} rows"
        self.record("/reference/trains", "GET", "passenger",
                    client.get(f"{base}/reference/trains?q=&limit=25", headers=passenger_headers))
        self.record("/reference/stations", "GET", "passenger",
                    client.get(f"{base}/reference/stations?q=del", headers=passenger_headers))
        self.record("/reference/trains/{n}/route", "GET", "passenger",
                    client.get(f"{base}/reference/trains/12301/route", headers=passenger_headers))

        state = self.record("/trains/{n}/state", "GET", "passenger",
                            client.get(f"{base}/trains/12301/state", headers=passenger_headers))
        payload = {k: v for k, v in state.json().items()
                   if k not in {"_id", "state_source", "updated_at", "simulated_at"}}

        prediction = self.record("/predict/eta", "POST", "passenger",
                                 client.post(f"{base}/predict/eta", headers=passenger_headers, json=payload))
        body = prediction.json()
        self.checks[-1].note = (f"P10-P90 {body.get('delay_p10_minutes', 0):.0f}-"
                                f"{body.get('delay_p90_minutes', 0):.0f}min, "
                                f"p>15={body.get('p_delay_gt_15', 0):.2f}")

        self.record("/trains/{n}/predictions", "GET", "passenger",
                    client.get(f"{base}/trains/12301/predictions?limit=50&skip=0", headers=passenger_headers))
        self.record("/trains/{n}/predictions/latest", "GET", "passenger",
                    client.get(f"{base}/trains/12301/predictions/latest", headers=passenger_headers))
        upcoming = self.record("/trains/{n}/upcoming-stations", "GET", "passenger",
                               client.get(f"{base}/trains/12301/upcoming-stations", headers=passenger_headers))
        self.checks[-1].note = upcoming.json().get("status", "")
        alerts = self.record("/alerts", "GET", "passenger",
                             client.get(f"{base}/alerts?limit=50", headers=passenger_headers))
        self.checks[-1].note = alerts.json().get("status", "")

        # --- staff/admin writes ---
        self.record("/trains/{n}/state", "PUT", "staff",
                    client.put(f"{base}/trains/12301/state", headers=staff_headers, json=payload))

        # --- error handling ---
        self.record("/predict/eta (bad body)", "POST", "passenger",
                    client.post(f"{base}/predict/eta", headers=passenger_headers,
                                json={"train_number": "x"}), 422, "validation envelope")
        self.record("/predict/eta (bad timestamp)", "POST", "passenger",
                    client.post(f"{base}/predict/eta", headers=passenger_headers, json={
                        "train_number": "12301", "current_timestamp": "nope",
                        "destination": "New Delhi"}), 422, "validation envelope")
        self.record("/trains/{unknown}/state", "GET", "passenger",
                    client.get(f"{base}/trains/00000/state", headers=passenger_headers), 404, "not found envelope")
        self.record("/reference/trains/{unknown}/route", "GET", "passenger",
                    client.get(f"{base}/reference/trains/00000/route", headers=passenger_headers), 404,
                    "not found envelope")

        # --- admin teardown ---
        self.record("/demo/reset", "POST", "admin", client.post(f"{base}/demo/reset", headers=admin_headers))
        self.record("/demo/seed", "POST", "admin",
                    client.post(f"{base}/demo/seed", headers=admin_headers), 200, "re-seeded for the UI")

        self.client.close()
        return self.report()

    def report(self) -> int:
        print(f"{'ROUTE':<40} {'METHOD':<7} {'ROLE':<10} {'STATUS':<7} {'OK?':<5} NOTE")
        print("-" * 110)
        for check in self.checks:
            print(f"{check.route:<40} {check.method:<7} {check.role:<10} {check.status:<7} "
                  f"{'yes' if check.ok else 'NO':<5} {check.note}")
        failed = [c for c in self.checks if not c.ok]
        print("-" * 110)
        print(f"{len(self.checks)} calls, {len(failed)} failed")
        for check in failed:
            print(f"  FAILED {check.method} {check.route} as {check.role}: "
                  f"got {check.status}, expected {check.expected}")
        return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    arguments = parser.parse_args()
    return EndToEndChecker(arguments.base_url).run()


if __name__ == "__main__":
    sys.exit(main())
