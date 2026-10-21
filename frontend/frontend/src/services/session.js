/**
 * The one place the browser's copy of a session is written, read and erased.
 *
 * It lives outside React because the axios interceptors need it too: a 401 can
 * arrive from anywhere, and the token has to be dropped whether or not a
 * component is mounted to notice.
 */

import { ML_APP_URL } from "../config";

const TOKEN_KEY = "token";
const USER_KEY = "user";
// Set when this browser hands a session to the ML app, so sign-out knows
// whether there is anything over there to clear. It is not a session itself.
const HANDOFF_KEY = "railpulse.mlHandoff";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const storeSession = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearStoredSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
};

export const markMlHandoff = () => localStorage.setItem(HANDOFF_KEY, "1");

export const consumeMlHandoff = () => {
    const handed = localStorage.getItem(HANDOFF_KEY) === "1";
    localStorage.removeItem(HANDOFF_KEY);
    return handed;
};

/**
 * The ML app's sign-out URL, which clears its storage and comes back here.
 *
 * It has to be a real top-level navigation. The two apps are different
 * origins, so this page cannot reach the ML app's storage directly, and a
 * hidden iframe would be a third-party context whose storage the browser
 * partitions separately -- clearing a copy nobody uses.
 */
export const mlLogoutUrl = (returnTo) =>
    `${ML_APP_URL}/#/logout?return=${encodeURIComponent(returnTo)}`;

/** The ML app's sign-in handoff URL, carrying the token in the fragment. */
export const mlHandoffUrl = (token, page = "") => {
    const target = `${ML_APP_URL}/#/sso?token=${encodeURIComponent(token)}`;
    return page ? `${target}&next=${encodeURIComponent(page)}` : target;
};
