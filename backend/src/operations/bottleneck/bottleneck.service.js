const Train = require("../../models/Train");
const Bottleneck = require("../../models/Bottleneck");
const { getTrainState } = require("../../services/liveState.service");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const detectBottleneck = async (trainId) => {
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

  const nextStation = train.route[currentIndex + 1]?.station;
  if (!nextStation) {
    throw createError("No next station exists", 400);
  }

  const delayMinutes = liveState.delayMinutes || 0;
  const score = delayMinutes <= 10 ? 20 : delayMinutes <= 30 ? 50 : 85;
  const severity = score <= 30 ? "LOW" : score <= 60 ? "MEDIUM" : "HIGH";
  const reason =
    severity === "LOW"
      ? "Minor or no delay"
      : severity === "MEDIUM"
        ? "Moderate delay"
        : "Severe delay";

  return Bottleneck.create({
    trainId,
    station: liveState.currentStation,
    section: `${liveState.currentStation} → ${nextStation}`,
    severity,
    score,
    reason,
    detectedAt: new Date(),
  });
};

module.exports = {
  detectBottleneck,
};
