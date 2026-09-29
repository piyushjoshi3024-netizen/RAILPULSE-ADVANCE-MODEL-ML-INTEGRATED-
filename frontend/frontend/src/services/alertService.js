import api from "./api";

export const getAlert = (trainId) => {
    return api.get(`/alerts/${trainId}`);
};