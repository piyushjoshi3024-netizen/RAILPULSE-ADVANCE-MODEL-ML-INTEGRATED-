import api from "./api";

export const getTrains = () => {
    return api.get("/trains");
};

export const getTrainById = (id) => {
    return api.get(`/trains/${id}`);
};