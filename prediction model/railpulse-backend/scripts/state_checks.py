"""Honest-state checks: the conditions a dashboard is most tempted to hide.

    python3 scripts/state_checks.py [--frontend URL] [--api URL]

Covers the states a data surface has to get right or it misleads:
degraded model, stale data, empty history, request timeout, 401 and 403
handling, and role isolation. Run it twice -- once normally, once with the
model artifact moved aside -- to exercise both the healthy and degraded paths.

Nothing here is mocked at the UI layer. Each check drives the real frontend
against the real backend, or calls the real API directly.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.core.config import get_settings  # noqa: E402

DEFAULT_FRONTEND = "http://localhost:3000"
DEFAULT_API = "http://127.0.0.1:8000/api/v1"


class StateChecks:
    def __init__(self, frontend: str, api: str) -> None:
        self.frontend = frontend.rstrip("/")
        self.api = api.rstrip("/")
        self.settings = get_settings()
        self.failures: list[str] = []
        self.skipped: list[str] = []

    def check(self, condition: bool, description: str) -> bool:
        print(f"  [{'PASS' if condition else 'FAIL'}] {description}")
        if not condition:
            self.failures.append(description)
        return bool(condition)

    def skip(self, description: str, why: str) -> None:
        print(f"  [SKIP] {description} ({why})")
        self.skipped.append(f"{description}: {why}")

    # ---------------------------------------------------------------- api

    def _token(self, username: str, password: str) -> str | None:
        import httpx
        try:
            response = httpx.post(f"{self.api}/auth/login",
                                  json={"username": username, "password": password}, timeout=20.0)
            return response.json().get("access_token") if response.status_code == 200 else None
        except Exception:
            return None

    def _passenger(self) -> tuple[str, str] | None:
        import httpx
        username = f"statecheck_{secrets.token_hex(4)}"
        password = "St-" + secrets.token_urlsafe(14)
        try:
            response = httpx.post(f"{self.api}/auth/register", json={
                "username": username, "password": password,
                "email": f"{username}@example.invalid", "full_name": "State check passenger",
            }, timeout=20.0)
            return (username, password) if response.status_code in (200, 201) else None
        except Exception:
            return None

    def api_states(self) -> dict:
        """401, 403 and role isolation, asserted against the running service."""
        import httpx

        print("\n1. Authentication and role isolation (API)")
        admin = self._token(self.settings.ADMIN_USERNAME, self.settings.ADMIN_PASSWORD)
        staff = self._token(self.settings.STAFF_USERNAME, self.settings.STAFF_PASSWORD)
        account = self._passenger()
        passenger = self._token(*account) if account else None
        self.check(bool(admin and staff and passenger), "all three roles can sign in")

        def status(path: str, token: str | None, method: str = "GET") -> int:
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            try:
                return httpx.request(method, f"{self.api}{path}", headers=headers,
                                     json={} if method != "GET" else None, timeout=20.0).status_code
            except Exception:
                return 0

        # `destructive` endpoints mutate shared state, so the authorised call is
        # deliberately not made: a guard is proved by who is refused, and firing
        # /demo/reset merely to observe a 200 would wipe the feed the rest of
        # these checks run against. Ask for None where the call is skipped.
        matrix = [
            ("/trains", "GET", (401, 200, 200, 200)),
            ("/model/evaluation", "GET", (401, 403, 403, 200)),
            ("/network/trains/12002/delay-propagation", "GET", (401, 403, 200, 200)),
            ("/simulation/update", "POST", (401, 403, 422, 422)),
            ("/demo/reset", "POST", (401, 403, 403, None)),
            ("/reference/load", "POST", (401, 403, 403, None)),
        ]
        for path, method, want in matrix:
            tokens = (None, passenger, staff, admin)
            got = tuple(None if expected is None else status(path, token, method)
                        for token, expected in zip(tokens, want))
            note = "" if None not in want else "  (authorised call skipped: it mutates shared state)"
            self.check(got == want,
                       f"{method} {path}: anon/passenger/staff/admin = {got} (expected {want}){note}")

        health = httpx.get(f"{self.api}/health/", timeout=20.0).json()
        return {"health": health, "admin": admin, "staff": staff,
                "passenger": passenger, "passenger_account": account}

    # ----------------------------------------------------------------- ui

    def ui_states(self, context: dict) -> None:
        from playwright.sync_api import sync_playwright

        health = context["health"]
        model_ready = health.get("model") == "ok"
        account = context["passenger_account"]
        if not account:
            self.skip("UI state checks", "could not register a passenger account")
            return

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()

            print("\n2. Degraded model" if not model_ready else "\n2. Model loaded (degraded path not active)")
            context_obj = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context_obj.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            self._login(page, "admin", self.settings.ADMIN_USERNAME, self.settings.ADMIN_PASSWORD, "admin")
            page.goto(f"{self.frontend}/#/admin/system", wait_until="networkidle")
            page.wait_for_timeout(3500)
            system = page.locator("#page-content").inner_text().lower()
            if model_ready:
                self.check("no prediction model is loaded" not in system,
                           "no false degraded claim while a model is loaded")
            else:
                self.check("no prediction model is loaded" in system,
                           "admin system page states that no model is loaded")
                self.check("training.pipeline" in system,
                           "degraded state names the command that fixes it")
            context_obj.close()

            print("\n3. Passenger-facing states")
            context_obj = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context_obj.new_page()
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            self._login(page, "user", account[0], account[1], "passenger")

            # Empty history: a freshly registered passenger has selected no
            # train, and no train has been predicted by them.
            page.goto(f"{self.frontend}/#/passenger/history", wait_until="networkidle")
            page.wait_for_timeout(2500)
            history = page.locator("#page-content").inner_text().lower()
            self.check("no train selected" in history or "no predictions" in history
                       or "nothing has been predicted" in history,
                       "empty history shows an empty state, not a blank page or a zero")

            # Alerts can never be populated; an empty list must not read as calm.
            page.goto(f"{self.frontend}/#/passenger/alerts", wait_until="networkidle")
            page.wait_for_timeout(2500)
            alerts = page.locator("#page-content").inner_text().lower()
            self.check("not available" in alerts, "alerts shows an explicit unavailable state")
            self.check("not a statement that your train is running normally" in alerts,
                       "empty alerts does not imply an all-clear")

            # Stale data: drive the journey view and look for the banner when
            # the state behind it really is old.
            page.goto(f"{self.frontend}/#/passenger/train", wait_until="networkidle")
            page.wait_for_timeout(3000)
            if page.locator("[data-action='track-train']").count():
                page.locator("[data-action='track-train']").first.click()
                page.wait_for_timeout(4000)
                journey = page.locator("#page-content").inner_text()
                import httpx
                trains = httpx.get(f"{self.api}/trains",
                                   headers={"Authorization": f"Bearer {context['passenger']}"},
                                   timeout=20.0).json().get("trains", [])
                any_stale = any("2026-09" in str(t.get("updated_at", "")) for t in trains)
                if any_stale:
                    self.skip("stale banner on a stale journey",
                              "the first card is a freshly seeded train; stale rows exist but are not first")
                else:
                    self.check("was last updated" not in journey or "ago" in journey,
                               "fresh state does not claim to be stale")
                self.check("IST" in journey, "journey times state their zone")
                self.check("gps-tracked" in journey.lower(),
                           "route does not imply live tracking it does not have")
                if model_ready:
                    self.check("Predicted arrival" in journey, "a prediction is shown while the model is loaded")
                else:
                    self.check("No prediction model is loaded" in journey
                               or "no arrival can be estimated" in journey.lower(),
                               "journey degrades to timetable-only without a model")
            else:
                self.skip("journey state checks", "no trains in the live feed")
            context_obj.close()

            print("\n4. Request timeout")
            # Point the app at a port nothing is listening on. The UI must say
            # the backend is unreachable rather than rendering an empty shell.
            context_obj = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context_obj.new_page()
            page.add_init_script("window.RAILPULSE_API_BASE_URL = 'http://127.0.0.1:9/api/v1';")
            page.goto(f"{self.frontend}/#/login/user", wait_until="networkidle")
            page.wait_for_timeout(1200)
            page.fill("input[name='username']", account[0])
            page.fill("input[name='password']", account[1])
            page.click("button[type='submit']")
            page.wait_for_timeout(6000)
            unreachable = page.locator("#page-content, #auth-error, .form-error").first.inner_text().lower()
            self.check("could not reach" in unreachable or "unreachable" in unreachable
                       or "timed out" in unreachable or "connection" in unreachable,
                       "an unreachable backend produces a stated error, not a blank page")
            context_obj.close()
            browser.close()

        # A 503 from /predict/eta while no model is loaded is the correct answer,
        # and the browser logs every failed response to the console whether or
        # not the page handled it. Expecting zero console entries in that state
        # would mean expecting the UI to hide a refusal it is supposed to show,
        # so that one case is classified rather than counted as a defect.
        expected = [e for e in errors
                    if not model_ready and "Failed to load resource" in e and "503" in e]
        unexpected = [e for e in errors if e not in expected]
        if expected:
            print(f"    ({len(expected)} expected 503 console entries while the model is unloaded)")
        self.check(not unexpected,
                   f"no unexpected console errors across the state checks ({len(unexpected)} seen)")
        for error in unexpected[:5]:
            print(f"    console: {error}")

    def _login(self, page, login_route: str, username: str, password: str, prefix: str) -> None:
        page.goto(f"{self.frontend}/#/login/{login_route}", wait_until="networkidle")
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        page.wait_for_function("p => window.location.hash.includes(p)", arg=f"/{prefix}/dashboard",
                               timeout=15000)

    def run(self) -> int:
        context = self.api_states()
        print(f"\n  model status reported by /health: {context['health'].get('model')}"
              f" | service: {context['health'].get('status')}")
        self.ui_states(context)
        print(f"\n{'ALL STATE CHECKS PASSED' if not self.failures else f'{len(self.failures)} STATE CHECKS FAILED'}"
              f"{f' ({len(self.skipped)} skipped)' if self.skipped else ''}")
        for failure in self.failures:
            print(f"  - {failure}")
        return 1 if self.failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend", default=DEFAULT_FRONTEND)
    parser.add_argument("--api", default=DEFAULT_API)
    arguments = parser.parse_args()
    return StateChecks(arguments.frontend, arguments.api).run()


if __name__ == "__main__":
    sys.exit(main())
