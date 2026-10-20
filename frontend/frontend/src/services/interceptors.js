import { clearStoredSession, getToken } from "./session";

/** Requests to these paths are allowed to answer 401 without ending a session. */
const CREDENTIAL_PATHS = ["/auth/login", "/auth/register"];

const isCredentialCheck = (config) =>
    CREDENTIAL_PATHS.some((path) => String(config?.url || "").includes(path));

const onLoginPage = () => window.location.pathname === "/login";

/**
 * Attach the stored token to every request, and treat a 401 as the end of the
 * session.
 *
 * Before this, an expired token left the browser on a page that still looked
 * signed in while every call behind it failed silently. A failed sign-in
 * attempt is deliberately exempt: 401 there means "wrong password", not
 * "your session ended", and redirecting would throw away the error the form
 * needs to show.
 */
export function attachSession(client) {
    client.interceptors.request.use((config) => {
        const token = getToken();

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    });

    client.interceptors.response.use(
        (response) => response,
        (error) => {
            const status = error?.response?.status;

            if (status === 401 && !isCredentialCheck(error.config)) {
                clearStoredSession();

                // A full navigation rather than a router push: the interceptor
                // runs outside React, and reloading guarantees no stale
                // component keeps rendering a signed-in view.
                if (!onLoginPage()) {
                    window.location.replace("/login?expired=1");
                }
            }

            return Promise.reject(error);
        }
    );

    return client;
}
