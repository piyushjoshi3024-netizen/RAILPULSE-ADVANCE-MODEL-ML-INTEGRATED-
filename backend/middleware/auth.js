const jwt = require("jsonwebtoken");

/**
 * Verify an access token issued by the FastAPI service.
 *
 * Node stopped issuing tokens when FastAPI became the only identity provider,
 * so this middleware is now purely a verifier. It trusts nothing about a token
 * beyond what the signature covers:
 *
 *  - the algorithm is pinned, so `alg: none` and an RS256/HS256 confusion are
 *    both refused rather than being negotiated by the attacker;
 *  - `sub` must be a non-empty string, because that is the only identity
 *    FastAPI puts in the token;
 *  - the role must be one this application actually defines, so an unknown or
 *    invented role fails closed instead of reaching a route handler;
 *  - nothing from the token is logged or echoed back.
 *
 * The secret is shared with FastAPI (its JWT_SECRET_KEY) and lives only in the
 * gitignored .env files.
 */

const ALLOWED_ALGORITHMS = ["HS256"];
const KNOWN_ROLES = new Set(["PASSENGER", "STAFF", "ADMIN"]);

const unauthorized = (res, message) =>
  res.status(401).json({ message });

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized(res, "Authentication token required");
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return unauthorized(res, "Authentication token required");
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ALLOWED_ALGORITHMS,
    });
  } catch (error) {
    // The reason is logged, never the token or its claims.
    console.error("AUTH ERROR:", error.message);
    return unauthorized(res, "Invalid or expired token");
  }

  const username =
    typeof decoded.sub === "string" ? decoded.sub.trim() : "";

  if (!username) {
    return unauthorized(res, "Invalid or expired token");
  }

  if (!KNOWN_ROLES.has(decoded.role)) {
    return unauthorized(res, "Invalid or expired token");
  }

  req.user = {
    username,
    role: decoded.role,
  };

  return next();
};

module.exports = authenticate;
