import axios from "axios";

/**
 * The identity service.
 *
 * FastAPI issues every token the two applications accept, so registration,
 * login and "who am I" all go here, while `services/api.js` keeps talking to
 * the Node API for train data. Both read the same stored token.
 *
 * The base URL is still a literal; Phase 6 moves it into configuration.
 */
const authApi = axios.create({
    baseURL: "http://localhost:8000/api/v1",
});

authApi.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

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
