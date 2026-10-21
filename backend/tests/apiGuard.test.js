/**
 * Tests for the central API guard (D4 route protection).
 *
 * Two halves. The first is the rule as a table: every route this application
 * mounts, and the level it must require. The second drives the middleware with
 * real tokens to prove the four cases that matter: no token is 401, a
 * PASSENGER writing is 403, STAFF and ADMIN are allowed, and a tampered token
 * is 401 -- not a 403, because a bad signature must never reach a role check.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const jwt = require("jsonwebtoken");

const SECRET = "test-shared-secret-at-least-32-characters-long";

let apiGuard;
let requiredAccess;
let originalSecret;

before(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = SECRET;
    apiGuard = require("../middleware/apiGuard");
    requiredAccess = apiGuard.requiredAccess;
});

after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
});

const tokenFor = (role, secret = SECRET) =>
    jwt.sign({ sub: "tester", role }, secret, { algorithm: "HS256" });

/** Run the guard against a request double and report what happened. */
function invoke(method, path, token) {
    const req = {
        method,
        path,
        headers: token ? { authorization: `Bearer ${token}` } : {},
    };

    const result = { status: null, body: null, allowed: false };

    const res = {
        status(code) {
            result.status = code;
            return this;
        },
        json(body) {
            result.body = body;
            return this;
        },
    };

    apiGuard(req, res, () => {
        result.allowed = true;
    });

    return { ...result, user: req.user };
}

describe("the rule, as a table", () => {
    it("leaves the health check public", () => {
        assert.equal(requiredAccess("GET", "/api/health"), "public");
    });

    it("leaves the retired identity endpoints public so they can answer 410", () => {
        for (const path of [
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/register-staff",
        ]) {
            assert.equal(requiredAccess("POST", path), "public", path);
        }

        assert.equal(requiredAccess("POST", "/api/staff-auth/send-otp"), "public");
        assert.equal(requiredAccess("POST", "/api/staff-auth/verify-otp"), "public");
    });

    it("opens every read to any signed-in role", () => {
        const reads = [
            "/api/trains",
            "/api/trains/abc123",
            "/api/trains/abc123/eta",
            "/api/trains/abc123/live-state",
            "/api/train-events",
            "/api/alerts",
            "/api/alerts/abc123",
            "/api/stations",
            "/api/corridors",
            "/api/auth/me",
        ];

        for (const path of reads) {
            assert.equal(requiredAccess("GET", path), "any", path);
        }
    });

    it("restricts every write to staff and admin", () => {
        const writes = [
            ["POST", "/api/trains"],
            ["PUT", "/api/trains/abc123"],
            ["DELETE", "/api/trains/abc123"],
            ["POST", "/api/train-events"],
            ["PUT", "/api/train-events/abc123"],
            ["DELETE", "/api/train-events/abc123"],
            ["PATCH", "/api/alerts/abc123"],
            ["DELETE", "/api/alerts/abc123"],
        ];

        for (const [method, path] of writes) {
            assert.equal(requiredAccess(method, path), "staff", `${method} ${path}`);
        }
    });

    it("restricts simulation and operations to staff and admin, reads included", () => {
        assert.equal(requiredAccess("POST", "/api/simulation/staff"), "staff");
        assert.equal(requiredAccess("POST", "/api/simulation/passenger"), "staff");
        assert.equal(requiredAccess("GET", "/api/operations/risk/abc123"), "staff");
        assert.equal(requiredAccess("GET", "/api/operations/bottleneck/abc"), "staff");
        assert.equal(requiredAccess("GET", "/api/operations/recovery/abc"), "staff");
    });

    it("keeps the two screens that every role can open working", () => {
        // The Dashboard summary, and the passenger journey search.
        assert.equal(requiredAccess("GET", "/api/operations/network"), "any");
        assert.equal(requiredAccess("POST", "/api/journey/plan"), "any");
    });

    it("is not fooled by a trailing slash or a query string", () => {
        assert.equal(requiredAccess("GET", "/api/health/"), "public");
        assert.equal(requiredAccess("GET", "/api/operations/network/"), "any");
        assert.equal(requiredAccess("GET", "/api/operations/network?x=1"), "any");
        assert.equal(requiredAccess("POST", "/api/simulation/"), "staff");
    });

    it("does not let a lookalike prefix inherit a rule", () => {
        // "/api/trainsets" is not "/api/trains".
        assert.equal(requiredAccess("POST", "/api/trainsets"), "any");
        assert.equal(requiredAccess("GET", "/api/operationsx"), "any");
    });

    it("defaults an unknown route to any signed-in role, never to public", () => {
        assert.notEqual(requiredAccess("GET", "/api/something-new"), "public");
        assert.equal(requiredAccess("GET", "/api/something-new"), "any");
    });
});

describe("the guard, driven with tokens", () => {
    it("lets the health check through with no token", () => {
        const result = invoke("GET", "/api/health", null);
        assert.equal(result.allowed, true);
        assert.equal(result.status, null);
    });

    it("answers 401 with no token on a read", () => {
        const result = invoke("GET", "/api/trains", null);
        assert.equal(result.allowed, false);
        assert.equal(result.status, 401);
    });

    it("answers 401 with no token on a write", () => {
        const result = invoke("DELETE", "/api/trains/abc123", null);
        assert.equal(result.allowed, false);
        assert.equal(result.status, 401);
    });

    it("lets a PASSENGER read", () => {
        const result = invoke("GET", "/api/trains", tokenFor("PASSENGER"));
        assert.equal(result.allowed, true);
        assert.equal(result.user.role, "PASSENGER");
    });

    it("answers 403 when a PASSENGER writes", () => {
        for (const [method, path] of [
            ["POST", "/api/trains"],
            ["PUT", "/api/trains/abc123"],
            ["DELETE", "/api/train-events/abc123"],
            ["POST", "/api/simulation/staff"],
            ["GET", "/api/operations/risk/abc123"],
        ]) {
            const result = invoke(method, path, tokenFor("PASSENGER"));
            assert.equal(result.allowed, false, `${method} ${path}`);
            assert.equal(result.status, 403, `${method} ${path}`);
        }
    });

    it("lets STAFF and ADMIN write", () => {
        for (const role of ["STAFF", "ADMIN"]) {
            for (const [method, path] of [
                ["POST", "/api/trains"],
                ["DELETE", "/api/trains/abc123"],
                ["POST", "/api/simulation/staff"],
                ["GET", "/api/operations/risk/abc123"],
            ]) {
                const result = invoke(method, path, tokenFor(role));
                assert.equal(result.allowed, true, `${role} ${method} ${path}`);
            }
        }
    });

    it("answers 401, not 403, for a tampered token on a write", () => {
        const forged = tokenFor("ADMIN", "a-different-secret-that-is-long-enough!");
        const result = invoke("POST", "/api/trains", forged);

        assert.equal(result.allowed, false);
        // 403 here would mean the signature was never checked.
        assert.equal(result.status, 401);
    });

    it("answers 401 for a token whose payload was edited after signing", () => {
        const [header, , signature] = tokenFor("PASSENGER").split(".");
        const payload = Buffer.from(
            JSON.stringify({ sub: "tester", role: "ADMIN" })
        ).toString("base64url");

        const result = invoke("POST", "/api/trains", `${header}.${payload}.${signature}`);

        assert.equal(result.allowed, false);
        assert.equal(result.status, 401);
    });

    it("lets a PASSENGER plan a journey and read the dashboard summary", () => {
        const token = tokenFor("PASSENGER");

        assert.equal(invoke("POST", "/api/journey/plan", token).allowed, true);
        assert.equal(invoke("GET", "/api/operations/network", token).allowed, true);
    });

    it("ignores anything outside /api", () => {
        const result = invoke("GET", "/socket.io/", null);
        assert.equal(result.allowed, true);
        assert.equal(result.status, null);
    });
});
