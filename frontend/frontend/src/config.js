/**
 * Where the other services live.
 *
 * Every origin used to be written into the file that needed it, which meant
 * the API base, the identity service and the ML app could drift apart from
 * each other and from the CORS allowlist. They are read from the build
 * environment now, and each one falls back to the value that was hardcoded
 * before, so an existing checkout with no .env behaves exactly as it did.
 */

const fromEnv = (key, fallback) => {
    const value = import.meta.env?.[key];
    return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : fallback;
};

/** The Express API that serves train data. */
export const API_BASE_URL = fromEnv("VITE_API_BASE_URL", "http://localhost:5000/api");

/** The FastAPI service that issues and validates every token. */
export const AUTH_BASE_URL = fromEnv("VITE_AUTH_BASE_URL", "http://localhost:8000/api/v1");

/** The ML frontend, which this site hands sessions to and signs out of. */
export const ML_APP_URL = fromEnv("VITE_ML_APP_URL", "http://localhost:3000");

/** Health endpoints, derived so they cannot drift from the bases above. */
export const API_HEALTH_URL = `${API_BASE_URL}/health`;
export const ML_HEALTH_URL = `${AUTH_BASE_URL}/health/`;
