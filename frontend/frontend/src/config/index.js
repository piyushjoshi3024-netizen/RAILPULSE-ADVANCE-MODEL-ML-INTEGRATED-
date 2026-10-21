/**
 * Where the other services live, and the two values the UI polls by.
 *
 * This was `src/config.js` beside a `src/config/` directory, which resolved
 * correctly and read like a trap (caveat C-B1). It is the directory's index
 * now, so `import ... from "../config"` keeps working unchanged, and the
 * polling and scenario modules sit beside it.
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

// Re-exported so "../config" is the one place to look, whichever of the three
// modules a value lives in.
export { LIVE_POLL_MS, ALERTS_POLL_MS, STATIC_POLL_MS } from "./polling";
export { SIMULATION_SCENARIOS } from "./scenarios";
