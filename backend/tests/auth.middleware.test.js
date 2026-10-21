/**
 * Tests for the Node authentication middleware after FastAPI became the only
 * identity provider.
 *
 * The middleware no longer issues anything; it only verifies tokens somebody
 * else signed. That makes the rejection paths the interesting ones, so most of
 * what is asserted here is what must NOT be accepted: another algorithm, a
 * different secret, an expired token, a token with no subject, and a role the
 * application does not know. A token that merely parses is not a token that
 * authenticates anybody.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const jwt = require("jsonwebtoken");

const SECRET = "test-shared-secret-at-least-32-characters-long";
const OTHER_SECRET = "a-different-secret-that-is-also-long-enough-ok";

let authenticate;
let originalSecret;

before(() => {
  originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  authenticate = require("../middleware/auth");
});

after(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

/** A minimal Express double: records the status and body, and whether next ran. */
function invoke(token) {
  const req = { headers: token === null ? {} : { authorization: token } };
  const result = { status: null, body: null, nextCalled: false };
  const res = {
    status(code) {
      result.status = code;
      return res;
    },
    json(payload) {
      result.body = payload;
      return res;
    },
  };

  authenticate(req, res, () => {
    result.nextCalled = true;
  });

  result.user = req.user;
  return result;
}

/** A token shaped the way FastAPI's TokenService.create writes them. */
function fastapiToken(claims = {}, options = {}) {
  return jwt.sign(
    { sub: "passenger_one", role: "PASSENGER", ...claims },
    options.secret || SECRET,
    { algorithm: "HS256", expiresIn: options.expiresIn || "60m", ...(options.sign || {}) }
  );
}

describe("authenticate", () => {
  it("accepts a current FastAPI token and exposes the username and role", () => {
    const result = invoke(`Bearer ${fastapiToken()}`);

    assert.equal(result.nextCalled, true);
    assert.equal(result.status, null);
    assert.deepEqual(result.user, { username: "passenger_one", role: "PASSENGER" });
  });

  it("accepts the other two roles", () => {
    for (const role of ["STAFF", "ADMIN"]) {
      const result = invoke(`Bearer ${fastapiToken({ role })}`);
      assert.equal(result.nextCalled, true, role);
      assert.equal(result.user.role, role);
    }
  });

  it("rejects a missing header", () => {
    const result = invoke(null);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a header that is not a Bearer token", () => {
    const result = invoke(fastapiToken());

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign(
      { sub: "passenger_one", role: "PASSENGER" },
      SECRET,
      { algorithm: "HS256", expiresIn: "-10s" }
    );

    const result = invoke(`Bearer ${expired}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a token signed with a different secret", () => {
    const result = invoke(`Bearer ${fastapiToken({}, { secret: OTHER_SECRET })}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects alg: none", () => {
    const unsigned = jwt.sign(
      { sub: "passenger_one", role: "PASSENGER" },
      "",
      { algorithm: "none" }
    );

    const result = invoke(`Bearer ${unsigned}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a token with no subject", () => {
    const noSubject = jwt.sign({ role: "PASSENGER" }, SECRET, { algorithm: "HS256" });

    const result = invoke(`Bearer ${noSubject}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a token with no role", () => {
    const noRole = jwt.sign({ sub: "passenger_one" }, SECRET, { algorithm: "HS256" });

    const result = invoke(`Bearer ${noRole}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a role the application does not define", () => {
    const result = invoke(`Bearer ${fastapiToken({ role: "SUPERUSER" })}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a tampered payload", () => {
    const token = fastapiToken({ role: "PASSENGER" });
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded.role = "ADMIN";
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const result = invoke(`Bearer ${header}.${forged}.${signature}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("rejects a legacy Node token, which carried userId instead of sub", () => {
    const legacy = jwt.sign(
      { userId: "6a9d5a64a663314c1afeaa69", role: "ADMIN" },
      SECRET,
      { algorithm: "HS256", expiresIn: "1d" }
    );

    const result = invoke(`Bearer ${legacy}`);

    assert.equal(result.nextCalled, false);
    assert.equal(result.status, 401);
  });

  it("never echoes the token or its payload in the response body", () => {
    const token = fastapiToken();
    const result = invoke(`Bearer ${token}`);
    const rejected = invoke(`Bearer ${fastapiToken({}, { secret: OTHER_SECRET })}`);

    assert.equal(JSON.stringify(result.body || {}).includes(token), false);
    assert.equal(JSON.stringify(rejected.body || {}).includes("passenger_one"), false);
  });
});
