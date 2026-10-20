export const CONFIG = Object.freeze({
    apiBaseUrl: window.RAILPULSE_API_BASE_URL || 'http://localhost:8000/api/v1',
    // The main RailPulse site. Used for the link back and to decide whether a
    // sign-out return address may be followed; anything not on this origin is
    // refused, so the shared sign-out cannot be turned into an open redirect.
    mainAppUrl: (window.RAILPULSE_MAIN_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
    healthPollMs: 30000,
    requestTimeoutMs: 12000,
});