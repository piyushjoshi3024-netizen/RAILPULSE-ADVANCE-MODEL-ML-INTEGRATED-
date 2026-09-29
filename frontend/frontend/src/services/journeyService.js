import api from "./api";

export const planJourney = (data) => {
    return api.post("/journey/plan", data);
};