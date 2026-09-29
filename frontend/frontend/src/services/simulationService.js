import api from "./api";

export const runPassengerSimulation = (data) => {
    return api.post("/simulation/passenger", data);
};
export const runStaffSimulation = (data) => {
  return api.post("/simulation/staff", data);
};