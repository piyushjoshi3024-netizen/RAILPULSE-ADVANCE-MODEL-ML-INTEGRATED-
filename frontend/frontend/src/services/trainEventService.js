import api from "./api";

export const getTrainEvents = (signal) => {
    return api.get("/train-events", { signal });
};

export const getTrainEventById = (id, signal) => {
    return api.get(`/train-events/${id}`, { signal });
};