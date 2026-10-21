import api from "./api";

export const getTrainETA = (id, signal) => {
    return api.get(`/trains/${id}/eta`, { signal });
};