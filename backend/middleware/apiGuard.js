const authenticate = require("./auth");
const authorize = require("./rbac");

/**
 * One place that decides who may reach which API route.
 *
 * Before this, protection was per-file and almost absent: only `/api/auth/*`
 * and `GET /api/trains/:id/eta` asked for a token, so every train, alert,
 * journey, simulation and operations route was open to the internet, including
 * the ones that delete. Scattering `authenticate` across twelve route files
 * would have left the same question open for the thirteenth, so the rule lives
 * here and applies to anything mounted under `/api`.
 *
 * Three levels:
 *
 *  - `public`  — the health check, and the retired identity endpoints, which
 *                answer 410 and must keep saying so to a caller with no token;
 *  - `any`     — reads, for any signed-in role;
 *  - `staff`   — writes, plus simulation and operations, for STAFF and ADMIN.
 *
 * Socket.IO is deliberately untouched.
 */

/** `METHOD /path` pairs that must stay reachable without a token. */
const PUBLIC = new Set([
    "GET /api/health",
    // Retired with the Express identity surface (D2). They answer 410 Gone,
    // and a 401 in front of them would hide that from the caller that needs it.
    "POST /api/auth/register",
    "POST /api/auth/login",
    "POST /api/auth/register-staff",
    "POST /api/staff-auth/send-otp",
    "POST /api/staff-auth/verify-otp",
]);

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Staff-and-admin regardless of method. */
const STAFF_PREFIXES = ["/api/simulation", "/api/operations"];

/** Staff-and-admin for writes; any signed-in role may read these. */
const WRITE_PREFIXES = [
    "/api/trains",
    "/api/train-events",
    "/api/alerts",
    "/api/journey",
];

/**
 * Routes the two rules above would have locked out of a screen that works.
 *
 * Both were found by running the pages as a PASSENGER rather than by reading
 * the rules, and both are listed in docs/UNIFY_PROGRESS.md:
 *
 *  - `GET /api/operations/network` is the summary on the Dashboard, which
 *    every role can open. It is a read-only aggregate with no train id in it.
 *  - `POST /api/journey/plan` is a passenger-facing search. It is a POST
 *    because it takes a body, and its only write is its own audit row.
 */
const ANY_ROLE_EXCEPTIONS = new Set([
    "GET /api/operations/network",
    "POST /api/journey/plan",
]);

const startsWithSegment = (path, prefix) =>
    path === prefix || path.startsWith(`${prefix}/`);

/**
 * The level a request needs. Exported so the rule can be tested as a table,
 * without a server, a database or a token.
 */
const requiredAccess = (method, path) => {
    const verb = String(method || "").toUpperCase();
    // Trailing slashes and query strings are the caller's, not the rule's.
    const route = String(path || "").split("?")[0].replace(/\/+$/, "") || "/";
    const key = `${verb} ${route}`;

    if (PUBLIC.has(key)) return "public";
    if (ANY_ROLE_EXCEPTIONS.has(key)) return "any";

    if (STAFF_PREFIXES.some((prefix) => startsWithSegment(route, prefix))) {
        return "staff";
    }

    if (
        WRITE_METHODS.has(verb) &&
        WRITE_PREFIXES.some((prefix) => startsWithSegment(route, prefix))
    ) {
        return "staff";
    }

    return "any";
};

const staffOnly = authorize("STAFF", "ADMIN");

const apiGuard = (req, res, next) => {
    if (!startsWithSegment(req.path, "/api")) return next();

    const level = requiredAccess(req.method, req.path);

    if (level === "public") return next();

    // authenticate answers 401 itself and does not call next() when it fails,
    // so the role check below only ever sees an authenticated request.
    return authenticate(req, res, () => {
        if (level === "staff") return staffOnly(req, res, next);
        return next();
    });
};

module.exports = apiGuard;
module.exports.requiredAccess = requiredAccess;
