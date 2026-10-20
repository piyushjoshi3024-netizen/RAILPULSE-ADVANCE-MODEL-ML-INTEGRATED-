import axios from "axios";

import { API_BASE_URL } from "../config";
import { attachSession } from "./interceptors";

const api = axios.create({
    baseURL: API_BASE_URL,
});

attachSession(api);

export default api;
