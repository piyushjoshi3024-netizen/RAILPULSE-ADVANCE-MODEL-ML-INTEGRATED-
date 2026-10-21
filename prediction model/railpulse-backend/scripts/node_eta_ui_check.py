"""Headless check of the Node + React ETA page against the live ML stack.

    python3 scripts/node_eta_ui_check.py

Requires the full stack running: MongoDB, Redis, FastAPI :8000, Node :5000 and
the React dev server :5173, plus a registered Node user. See
backend/ML_INTEGRATION.md.
"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

login = urllib.request.urlopen(urllib.request.Request(
    "http://127.0.0.1:5000/api/auth/login",
    data=json.dumps({"email": "uitester@example.com", "password": "TestPass123"}).encode(),
    headers={"Content-Type": "application/json"}))
payload = json.load(login)
token, user = payload["token"], payload["user"]

failures = []
def check(ok, label):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
    if not ok: failures.append(label)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1700})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script(f"""
        localStorage.setItem('token', {json.dumps(token)});
        localStorage.setItem('user', {json.dumps(json.dumps(user))});
    """)
    page.goto("http://127.0.0.1:5173/eta", wait_until="networkidle")
    page.wait_for_timeout(2000)

    check("ETA Prediction" in page.inner_text("body"), "ETA page rendered for an authenticated user")
    page.click("text=Predict ETA")
    page.wait_for_selector("text=Model delay quantiles", timeout=20000)
    page.wait_for_timeout(800)
    body = page.inner_text("body")

    check("ml model · delay-v3" in body.lower(), "model status badge shows the ML version")
    check("trained on synthetic data" in body.lower(), "synthetic-data badge shown")
    check("Model delay quantiles" in body, "quantile panel rendered")
    check("P10" in body and "P50" in body and "P90" in body, "P10/P50/P90 labels shown")
    check("delay > 15 min" in body.lower(), "probability of a material delay shown")
    check("half the P10–P90 range" in body, "confidence explained as the real interval")
    check("70%" not in body.split("Prediction Confidence")[1][:200] if "Prediction Confidence" in body else True,
          "hardcoded 70% confidence bar removed")
    check(not errors, f"no console errors ({len(errors)})")
    for e in errors[:5]: print("    console:", e)

    page.locator("text=Model delay quantiles").scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    page.screenshot(path="reports/figures/node_eta_ml.png")
    print("\n  screenshot -> reports/figures/node_eta_ml.png")
    browser.close()

print("\nALL UI CHECKS PASSED" if not failures else f"\n{len(failures)} UI CHECKS FAILED")
sys.exit(1 if failures else 0)
