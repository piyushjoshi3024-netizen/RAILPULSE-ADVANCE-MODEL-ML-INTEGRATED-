import axios from "axios";

import { AUTH_BASE_URL } from "../config";
import { attachSession } from "./interceptors";

/**
 * The identity service.
 *
 * FastAPI issues every token the two applications accept, so registration,
 * login and "who am I" go here, while `services/api.js` talks to the Express
 * API for train data. Both read the same stored token.
 */
const authApi = axios.create({
    baseURL: AUTH_BASE_URL,
});

attachSession(authApi);

/** FastAPI reports validation and auth failures as `detail`. */
export const authErrorMessage = (error, fallback) => {
    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") return detail;

    if (Array.isArray(detail)) {
        const joined = detail
            .map((item) => item.msg || item.message)
            .filter(Boolean)
            .join(". ");

        if (joined) return joined;
    }

    return fallback;
};

export default authApi;
