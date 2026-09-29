const Train = require("../../models/Train");
const Propagation = require("../../models/Propagation");
const { getTrainState } = require("../../services/liveState.service");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const calculatePropagation = async (trainId) => {
  const train = await Train.findById(trainId);
  if (!train) {
    throw createError("Train not found", 404);
  }

  const liveState = await getTrainState(String(trainId));
  if (!liveState) {
    throw createError("Live state not found", 404);
  }

  const currentIndex = train.route.findIndex(
    (routeItem) => routeItem.station === liveState.currentStation
  );
  if (currentIndex === -1) {
    throw createError("Current station not found in route", 400);
  }

  const downstreamStations = train.route.slice(currentIndex + 1);
  if (downstreamStations.length === 0) {
    throw createError("No downstream stations found", 400);
  }

  const delayMinutes = liveState.delayMinutes || 0;
  const impactLevel =
    delayMinutes <= 10 ? "LOW" : delayMinutes <= 30 ? "MEDIUM" : "HIGH";
  const propagationScore =
    delayMinutes <= 10 ? 20 : delayMinutes <= 30 ? 50 : 85;
  const affectedStations = downstreamStations.map((routeItem) => ({
    station: routeItem.station,
    estimatedDelayMinutes: delayMinutes,
    impactLevel,
  }));

  const reason =
    impactLevel === "LOW"
      ? "Minor or no delay propagating downstream"
      : impactLevel === "MEDIUM"
        ? "Moderate delay propagating downstream"
        : "Severe delay propagating downstream";

  return Propagation.create({
    trainId,
    fromStation: liveState.currentStation,
    affectedStations,
    totalAffectedStations: affectedStations.length,
    propagationScore,
    reason,
    detectedAt: new Date(),
  });
};

module.exports = {
  calculatePropagation,
};
