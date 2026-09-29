import api from "./api";

export const getRisk = (trainId) => {
  return api.get(`/operations/risk/${trainId}`);
};

export const getBottleneck = (trainId) => {
  return api.get(`/operations/bottleneck/${trainId}`);
};

export const getPropagation = (trainId) => {
  return api.get(`/operations/propagation/${trainId}`);
};

export const getRecovery = (trainId) => {
  return api.get(`/operations/recovery/${trainId}`);
};