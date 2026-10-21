import api from "./api";

// The optional signal lets useResource abort a request whose answer is no
// longer wanted -- an unmounted page, or a refetch that superseded it.
export const getTrains = (signal) => {
    return api.get("/trains", { signal });
};

export const getTrainById = (id, signal) => {
    return api.get(`/trains/${id}`, { signal });
};