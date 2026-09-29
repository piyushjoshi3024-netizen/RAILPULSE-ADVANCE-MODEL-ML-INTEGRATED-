import api from "./api";

export const getTrainETA = (id) => {
    return api.get(`/trains/${id}/eta`);
};