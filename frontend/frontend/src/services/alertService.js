import api from "./api";

export const getAlerts = (signal) => {
    return api.get("/alerts", { signal });
};

export const getAlert = (trainId, signal) => {
    return api.get(`/alerts/${trainId}`, { signal });
};