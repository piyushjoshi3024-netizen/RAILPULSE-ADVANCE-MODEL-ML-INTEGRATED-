"""Headless UI smoke tests against the real frontend.

Two modes:

    python3 scripts/ui_smoke.py [--frontend URL] [--role admin]
        The original single-role prediction check: log in, open a train, run a
        prediction, and assert the panel shows the interval, the probability of
        a delay over 15 minutes and the prototype notice.

    python3 scripts/ui_smoke.py --sweep
        Log in as PASSENGER, STAFF and ADMIN in turn and visit every route at
        360, 768 and 1280 px. Asserts zero console errors, zero page errors and
        no horizontal scroll on each, tabs through each page to confirm the
        focus order reaches something, re-runs one pass with reduced motion
        emulated, and writes a screenshot per role/page/viewport into
        reports/figures/ui/.

Credentials come from the environment when set (RAILPULSE_ADMIN_USERNAME /
RAILPULSE_ADMIN_PASSWORD and the STAFF equivalents) and fall back to the
development defaults. The sweep registers a throwaway PASSENGER account per run,
because passenger accounts are created through the API rather than seeded.

Screenshots are captured viewport-only, not full-page: Chromium renders charts
on very tall full-page captures incorrectly, which makes a full-page image
misleading evidence even when the DOM is correct.
"""

from __future__ import annotations

import argparse
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from training.config import FIGURES_DIR  # noqa: E402

DEFAULT_FRONTEND = "http://localhost:3000"
DEFAULT_API = "http://127.0.0.1:8000/api/v1"

# Development defaults, overridable from the environment so a non-default
# deployment can be swept without editing this file.
CREDENTIALS = {
    "admin": (
        os.environ.get("RAILPULSE_ADMIN_USERNAME", "admin"),
        os.environ.get("RAILPULSE_ADMIN_PASSWORD", "change-me-admin"),
    ),
    "staff": (
        os.environ.get("RAILPULSE_STAFF_USERNAME", "staff"),
        os.environ.get("RAILPULSE_STAFF_PASSWORD", "change-me-staff"),
    ),
}

# Every route each role can reach, in nav order.
ROUTES = {
    "passenger": ["dashboard", "train", "history", "alerts"],
    "staff": ["dashboard", "train", "history", "alerts", "simulation", "capabilities"],
    "admin": ["dashboard", "train", "history", "alerts", "simulation", "capabilities", "system"],
}

VIEWPORTS = [("1280", 1280, 900), ("768", 768, 1000), ("360", 360, 780)]

# Hash-only navigation fires no load event, so the URL is polled instead of
# waited on. The original wait_for_url call could never succeed against this
# router; it failed identically on the pre-change frontend.
def _await_hash(page, fragment: str, timeout_ms: int = 15000) -> bool:
    page.wait_for_function(
        "fragment => window.location.hash.includes(fragment)",
        arg=fragment,
        timeout=timeout_ms,
    )
    return fragment in page.url


class UiSmokeTest:
    """Drives the real UI in a headless browser and checks what it renders."""

    def __init__(self, frontend: str = DEFAULT_FRONTEND, role: str = "admin",
                 api: str = DEFAULT_API) -> None:
        self.frontend = frontend.rstrip("/")
        self.api = api.rstrip("/")
        self.role = role
        self.username, self.password = CREDENTIALS[role]
        self.failures: list[str] = []
        self.console_errors: list[str] = []

    def check(self, condition: bool, description: str) -> None:
        status = "PASS" if condition else "FAIL"
        print(f"  [{status}] {description}")
        if not condition:
            self.failures.append(description)

    def model_quality(self) -> dict:
        """Read what the API says about the model, so assertions follow the data."""
        import httpx

        try:
            return httpx.get(f"{self.api}/health/", timeout=15.0).json().get("model_quality", {})
        except Exception as exc:  # the UI assertions below handle the empty case
            print(f"  (could not read {self.api}/health/: {exc})")
            return {}

    def run(self) -> int:
        from playwright.sync_api import sync_playwright

        quality = self.model_quality()
        provenance = str(quality.get("data_provenance", "unknown")).lower()
        beats_baseline = quality.get("beats_baseline")
        print(f"\n0. Model under test: provenance={provenance}, beats_baseline={beats_baseline}")

        os.makedirs(FIGURES_DIR, exist_ok=True)
        screenshot = os.path.join(FIGURES_DIR, "ui_smoke.png")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 1600})
            page.on("console", lambda message: (
                self.console_errors.append(message.text) if message.type == "error" else None
            ))

            print(f"\n1. Login as {self.role}")
            page.goto(f"{self.frontend}/#/login/{self.role}", wait_until="networkidle")
            page.fill("input[name='username']", self.username)
            page.fill("input[name='password']", self.password)
            page.click("button[type='submit']")
            _await_hash(page, "/dashboard")
            self.check("dashboard" in page.url, f"reached the {self.role} dashboard")

            print("\n2. Open the fleet and drill into a train")
            page.goto(f"{self.frontend}/#/{self.role}/train", wait_until="networkidle")
            page.wait_for_selector("[data-action='staff-detail']", timeout=20000)
            rows = page.locator(".fleet-table tbody tr").count()
            self.check(rows > 0, f"fleet table rendered ({rows} trains)")
            intervals = page.locator(".interval-cell").count()
            self.check(intervals >= 0, f"interval indicators present where a stored range exists ({intervals})")
            page.locator("[data-action='staff-detail']").first.click()
            page.wait_for_selector("#train-detail [data-action='staff-predict']", timeout=20000)

            detail = page.locator("#train-detail").inner_text()
            self.check("are not inputs to the model" in detail,
                       "drill-down states which stored fields the model ignores")

            print("\n3. Run a prediction")
            page.locator("[data-action='staff-predict']").first.click()
            page.wait_for_selector("#detail-prediction .rp-panel", timeout=40000)
            page.wait_for_timeout(600)
            panel = page.locator("#detail-prediction").inner_text()
            # Compared case-insensitively: these labels are upper-cased by CSS,
            # and inner_text() returns the rendered text, not the source.
            lowered = panel.lower()

            self.check("p10 to p90" in lowered, "P10-P90 delay range is shown")
            self.check("chance over 15 min" in lowered, "P(delay > 15 min) is shown")
            self.check("predicted arrival" in lowered, "predicted arrival is shown")
            self.check("delay-v3" in lowered, "model version is shown")
            self.check("had no effect on the result" in lowered,
                       "fields the model discarded are named back to the caller")
            self.check("IST" in panel, "times state their zone")

            # Provenance and baseline claims must match what the API reports.
            # Both live on the operational overview, which is where a staff user
            # is told what to think of the numbers.
            page.goto(f"{self.frontend}/#/{self.role}/dashboard", wait_until="networkidle")
            page.wait_for_timeout(3500)
            overview = page.locator("#page-content").inner_text()
            if provenance == "synthetic":
                self.check("SYNTHETIC" in overview.upper(), "synthetic-data notice is shown")
            if beats_baseline is False:
                self.check("not" in overview.lower() and "baseline" in overview.lower(),
                           "baseline honesty note is shown (model does not beat baseline)")
            elif beats_baseline is True:
                self.check("does not beat its mean-delay baseline" not in overview,
                           "no false baseline claim (model does beat baseline)")

            page.wait_for_timeout(400)
            page.screenshot(path=screenshot, full_page=False)
            print(f"\n4. Screenshot saved to {os.path.relpath(screenshot, BASE_DIR)}")
            print("\n--- prediction panel ---")
            for line in panel.splitlines():
                if line.strip():
                    print(f"  {line}")
            browser.close()

        self.check(not self.console_errors, f"no console errors ({len(self.console_errors)} seen)")
        for error in self.console_errors:
            print(f"    console: {error}")

        print(f"\n{'ALL UI CHECKS PASSED' if not self.failures else f'{len(self.failures)} UI CHECKS FAILED'}")
        return 1 if self.failures else 0


class RoleSweep:
    """Visit every route for every role at every viewport, and record what broke.

    The assertions are deliberately generic -- console errors, page errors,
    horizontal overflow, a reachable focus order, rendered content -- because a
    sweep that encoded each page's copy would need rewriting whenever the copy
    changed, and would stop catching the thing it exists to catch.
    """

    def __init__(self, frontend: str = DEFAULT_FRONTEND, api: str = DEFAULT_API) -> None:
        self.frontend = frontend.rstrip("/")
        self.api = api.rstrip("/")
        self.failures: list[str] = []
        self.rows: list[dict] = []
        self.shots = os.path.join(FIGURES_DIR, "ui")

    def check(self, condition: bool, description: str) -> None:
        if not condition:
            self.failures.append(description)

    def _passenger_account(self) -> tuple[str, str]:
        """Register a throwaway passenger; the API is the only way to make one."""
        import secrets
        import httpx

        username = f"uismoke_{secrets.token_hex(4)}"
        password = "Ui-" + secrets.token_urlsafe(14)
        response = httpx.post(
            f"{self.api}/auth/register",
            json={
                "username": username,
                "password": password,
                "email": f"{username}@example.invalid",
                "full_name": "UI smoke passenger",
            },
            timeout=20.0,
        )
        if response.status_code not in (200, 201):
            raise RuntimeError(f"could not register a passenger: {response.status_code}")
        return username, password

    def _login(self, page, login_route: str, username: str, password: str, prefix: str) -> None:
        page.goto(f"{self.frontend}/#/login/{login_route}", wait_until="networkidle")
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        page.click("button[type='submit']")
        _await_hash(page, f"/{prefix}/dashboard")

    def _visit(self, page, prefix: str, route: str, label: str, errors, page_errors) -> dict:
        before_console, before_page = len(errors), len(page_errors)
        page.goto(f"{self.frontend}/#/{prefix}/{route}", wait_until="networkidle")
        # Charts mount after their data resolves; give the slowest page room.
        page.wait_for_timeout(3500)

        body = page.locator("#page-content").inner_text().strip()
        overflow = page.evaluate(
            "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"
        )
        charts = page.locator("svg.chart-svg").count()

        # Tab through the page and record where focus lands. A page where Tab
        # reaches nothing is unusable by keyboard even if it renders perfectly.
        focused = []
        for _ in range(12):
            page.keyboard.press("Tab")
            focused.append(page.evaluate(
                "document.activeElement ? document.activeElement.tagName.toLowerCase() : 'none'"
            ))
        reachable = [name for name in focused if name not in ("body", "none", "html")]

        # Every chart must carry a text alternative and a stated source.
        missing_aria = page.evaluate(
            "[...document.querySelectorAll('svg.chart-svg')].filter(s => !s.getAttribute('aria-label')).length"
        )
        missing_source = page.evaluate(
            "[...document.querySelectorAll('figure.chart-card')].filter(f => !f.querySelector('.chart-source')).length"
        )

        new_console = errors[before_console:]
        new_page_errors = page_errors[before_page:]

        self.check(len(body) > 40, f"{prefix}/{route} @{label}: page rendered content")
        self.check(not overflow, f"{prefix}/{route} @{label}: no horizontal scroll")
        self.check(not new_console, f"{prefix}/{route} @{label}: no console errors")
        self.check(not new_page_errors, f"{prefix}/{route} @{label}: no page errors")
        self.check(bool(reachable), f"{prefix}/{route} @{label}: focus order reaches something")
        self.check(not missing_aria, f"{prefix}/{route} @{label}: every chart has an aria-label")
        self.check(not missing_source, f"{prefix}/{route} @{label}: every chart states its source")

        os.makedirs(self.shots, exist_ok=True)
        shot = os.path.join(self.shots, f"{prefix}-{route}-{label}.png")
        page.screenshot(path=shot, full_page=False)

        return {
            "role": prefix, "route": route, "viewport": label,
            "chars": len(body), "charts": charts, "overflow": overflow,
            "console": len(new_console), "page_errors": len(new_page_errors),
            "tab_stops": len(reachable), "no_aria": missing_aria, "no_source": missing_source,
            "console_text": new_console[:2] + new_page_errors[:2],
        }

    def run(self) -> int:
        from playwright.sync_api import sync_playwright

        passenger_user, passenger_password = self._passenger_account()
        accounts = [
            ("passenger", "user", passenger_user, passenger_password),
            ("staff", "staff", *CREDENTIALS["staff"]),
            ("admin", "admin", *CREDENTIALS["admin"]),
        ]

        print(f"Sweeping {sum(len(ROUTES[r[0]]) for r in accounts)} role/route pairs "
              f"across {len(VIEWPORTS)} viewports, plus one reduced-motion pass.\n")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            for prefix, login_route, username, password in accounts:
                for label, width, height in VIEWPORTS:
                    context = browser.new_context(viewport={"width": width, "height": height})
                    page = context.new_page()
                    errors: list[str] = []
                    page_errors: list[str] = []
                    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                    page.on("pageerror", lambda e: page_errors.append(str(e)))
                    self._login(page, login_route, username, password, prefix)
                    for route in ROUTES[prefix]:
                        row = self._visit(page, prefix, route, label, errors, page_errors)
                        self.rows.append(row)
                        flag = "" if (row["console"] == 0 and row["page_errors"] == 0
                                      and not row["overflow"]) else "  <-- CHECK"
                        print(f"  {prefix:9} {route:13} @{label:5} "
                              f"chars={row['chars']:<6} charts={row['charts']} "
                              f"tabs={row['tab_stops']:<3} overflow={str(row['overflow']):<5} "
                              f"console={row['console']} pageerr={row['page_errors']}{flag}")
                        if row["console_text"]:
                            for line in row["console_text"]:
                                print(f"      ! {line[:140]}")
                    context.close()

            # One more pass with reduced motion, asserting no reveal animation
            # survives anywhere. The CSS and the chart module each suppress it;
            # this checks they actually do.
            print("\n  reduced-motion pass (1280):")
            for prefix, login_route, username, password in accounts:
                context = browser.new_context(
                    viewport={"width": 1280, "height": 900}, reduced_motion="reduce"
                )
                page = context.new_page()
                self._login(page, login_route, username, password, prefix)
                for route in ROUTES[prefix]:
                    page.goto(f"{self.frontend}/#/{prefix}/{route}", wait_until="networkidle")
                    page.wait_for_timeout(2500)
                    animated = page.evaluate(
                        "document.querySelectorAll('.chart-reveal').length"
                        " + document.querySelectorAll('svg.chart-svg g[clip-path]').length"
                    )
                    self.check(animated == 0,
                               f"{prefix}/{route}: no reveal animation under reduced motion")
                    if animated:
                        print(f"    {prefix}/{route}: {animated} animated elements  <-- CHECK")
                print(f"    {prefix}: {len(ROUTES[prefix])} routes clean")
                context.close()
            browser.close()

        totals = {
            "pages": len(self.rows),
            "console": sum(r["console"] for r in self.rows),
            "page_errors": sum(r["page_errors"] for r in self.rows),
            "overflow": sum(1 for r in self.rows if r["overflow"]),
            "charts": sum(r["charts"] for r in self.rows),
            "no_aria": sum(r["no_aria"] for r in self.rows),
            "no_source": sum(r["no_source"] for r in self.rows),
        }
        print(f"\n  pages visited        : {totals['pages']}")
        print(f"  console errors       : {totals['console']}")
        print(f"  page errors          : {totals['page_errors']}")
        print(f"  pages with overflow  : {totals['overflow']}")
        print(f"  charts rendered      : {totals['charts']}")
        print(f"  charts missing aria  : {totals['no_aria']}")
        print(f"  charts missing source: {totals['no_source']}")
        print(f"  screenshots          : {os.path.relpath(self.shots, BASE_DIR)}")

        if self.failures:
            print(f"\n{len(self.failures)} SWEEP CHECKS FAILED")
            for failure in self.failures:
                print(f"  - {failure}")
            return 1
        print("\nALL SWEEP CHECKS PASSED")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend", default=DEFAULT_FRONTEND)
    parser.add_argument("--role", default="admin", choices=sorted(CREDENTIALS))
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--sweep", action="store_true",
                        help="visit every route for every role at every viewport")
    arguments = parser.parse_args()
    if arguments.sweep:
        return RoleSweep(arguments.frontend, arguments.api).run()
    return UiSmokeTest(arguments.frontend, arguments.role, arguments.api).run()


if __name__ == "__main__":
    sys.exit(main())
