const Train = require("../models/Train");
const ETAPrediction = require("../models/ETAPrediction");
const { getTrainState } = require("./liveState.service");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseScheduledEta = (value, referenceDate) => {
  if (!value) {
    return null;
  }

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(value);

  if (timeMatch) {
    const scheduledDate = new Date(referenceDate);

    scheduledDate.setUTCHours(
      Number(timeMatch[1]),
      Number(timeMatch[2]),
      0,
      0
    );

    if (scheduledDate < referenceDate) {
      scheduledDate.setUTCDate(
        scheduledDate.getUTCDate() + 1
      );
    }

    return scheduledDate;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const calculateEta = async (trainId) => {
  const train = await Train.findById(trainId);

  if (!train) {
    throw createError("Train not found", 404);
  }

  const liveState = await getTrainState(String(trainId));

  if (!liveState) {
    throw createError("Live state not found", 404);
  }

  if (liveState.speed <= 0) {
    throw createError("Current speed must be greater than 0", 400);
  }

  const currentIndex = train.route.findIndex(
    (routeItem) =>
      routeItem.station === liveState.currentStation
  );

  if (currentIndex === -1) {
    throw createError(
      "Current station not found in route",
      400
    );
  }

  const destinationIndex = train.route.findIndex(
    (routeItem) =>
      routeItem.station === train.destination
  );

  if (destinationIndex === -1) {
    throw createError(
      "Destination not found in route",
      400
    );
  }

  const remainingDistance = train.route
    .slice(currentIndex + 1, destinationIndex + 1)
    .reduce(
      (total, routeItem) =>
        total + (routeItem.distanceFromPrevious || 0),
      0
    );

  const currentTime = liveState.timestamp
    ? new Date(liveState.timestamp)
    : new Date();

  const travelTimeMinutes =
    (remainingDistance / liveState.speed) * 60;

  const predictedEta = new Date(
    currentTime.getTime() +
      (travelTimeMinutes + liveState.delayMinutes) *
        60 *
        1000
  );

  const scheduledEta = parseScheduledEta(
    train.route[destinationIndex].scheduledArrival,
    currentTime
  );

  if (!scheduledEta) {
    throw createError(
      "Destination scheduled arrival not found",
      400
    );
  }

  const delayMinutes = Math.round(
    (predictedEta.getTime() - scheduledEta.getTime()) /
      60000
  );

  return ETAPrediction.create({
    trainId: train._id,
    station: train.destination,
    scheduledEta,
    predictedEta,
    delayMinutes,
    confidenceMinutes: 10,
    riskLevel:
      delayMinutes > 30
        ? "HIGH"
        : delayMinutes > 10
        ? "MEDIUM"
        : "LOW",
    mainCause:
      liveState.delayMinutes > 0
        ? "Current delay"
        : "Normal operation",
    predictionTimestamp: new Date(),
    modelVersion: "v1-rule-based",
  });
};

module.exports = {
  calculateEta,
};
