"""Headless UI smoke test: login -> select train -> predict.

    python3 scripts/ui_smoke.py [--frontend http://127.0.0.1:3000] [--role admin]

Asserts the prediction panel shows the P10-P90 range, the probability of a
delay over 15 minutes and the prototype badge, then saves a screenshot to
reports/figures/ui_smoke.png.
"""

from __future__ import annotations

import argparse
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from training.config import FIGURES_DIR  # noqa: E402

DEFAULT_FRONTEND = "http://127.0.0.1:3000"
DEFAULT_API = "http://127.0.0.1:8000/api/v1"
CREDENTIALS = {"admin": ("admin", "change-me-admin"), "staff": ("staff", "change-me-staff")}


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
            page.wait_for_url("**/dashboard", timeout=15000)
            self.check("dashboard" in page.url, f"reached the {self.role} dashboard")

            print("\n2. Open the live trains page")
            page.goto(f"{self.frontend}/#/{self.role}/train", wait_until="networkidle")
            page.wait_for_selector("[data-action='predict']", timeout=15000)
            options = page.locator("#train-options option").count()
            self.check(options > 0, f"train autocomplete populated ({options} options)")
            cards = page.locator("[data-action='predict']").count()
            self.check(cards > 0, f"live train cards rendered ({cards})")

            print("\n3. Select a train and predict")
            page.locator("[data-action='predict']").first.click()
            page.wait_for_selector("#prediction-result .prediction-hero", timeout=30000)
            panel = page.locator("#prediction-result").inner_text()

            self.check("Likely delay range" in panel, "P10-P90 delay range is shown")
            self.check("Chance of >15 min delay" in panel, "P(delay > 15 min) is shown")
            self.check("Prototype model, trained on" in panel, "prototype notice is shown")
            self.check("ETA window" in panel, "ETA window is shown")
            self.check("delay-v3" in panel, "model version is shown")

            # Provenance and baseline claims must match what the API reports.
            if provenance == "synthetic":
                self.check("SYNTHETIC" in panel.upper(), "synthetic-data notice is shown")
                self.check("TRAINED ON SYNTHETIC DATA" in panel.upper(), "synthetic badge chip is shown")
            if beats_baseline is False:
                self.check("does not beat its mean-delay baseline" in panel,
                           "baseline honesty note is shown (model does not beat baseline)")
            elif beats_baseline is True:
                self.check("does not beat its mean-delay baseline" not in panel,
                           "no false baseline claim (model does beat baseline)")

            # Scroll the panel into view so the screenshot shows what was asserted.
            page.locator("#prediction-result").scroll_into_view_if_needed()
            page.wait_for_timeout(600)
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend", default=DEFAULT_FRONTEND)
    parser.add_argument("--role", default="admin", choices=sorted(CREDENTIALS))
    parser.add_argument("--api", default=DEFAULT_API)
    arguments = parser.parse_args()
    return UiSmokeTest(arguments.frontend, arguments.role, arguments.api).run()


if __name__ == "__main__":
    sys.exit(main())
