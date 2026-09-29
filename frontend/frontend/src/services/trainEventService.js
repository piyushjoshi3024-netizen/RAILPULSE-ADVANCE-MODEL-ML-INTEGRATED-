import api from "./api";

export const getTrainEvents = () => {
    return api.get("/train-events");
};

export const getTrainEventById = (id) => {
    return api.get(`/train-events/${id}`);
};