const Train = require("../models/Train");
const ETAPrediction = require("../models/ETAPrediction");
const { getTrainState } = require("./liveState.service");
const { predictWithMl } = require("./mlEta.service");

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

/**
 * Gather everything both the rule-based and the model path need.
 *
 * Throws the same errors the ETA endpoint has always thrown, so a train that
 * could not be priced before still cannot be priced now.
 */
const buildEtaContext = async (trainId) => {
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

  return {
    train,
    liveState,
    currentTime,
    scheduledEta,
    remainingDistanceKm: remainingDistance,
  };
};

/** The original rule-based estimate: remaining distance over current speed. */
const calculateRuleBasedEta = (context) => {
  const { liveState, currentTime, scheduledEta, remainingDistanceKm } = context;

  const travelTimeMinutes =
    (remainingDistanceKm / liveState.speed) * 60;

  const predictedEta = new Date(
    currentTime.getTime() +
      (travelTimeMinutes + liveState.delayMinutes) *
        60 *
        1000
  );

  const delayMinutes = Math.round(
    (predictedEta.getTime() - scheduledEta.getTime()) /
      60000
  );

  return {
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
    modelVersion: "v1-rule-based",
  };
};

/**
 * Produce an ETA, preferring the model and falling back to the rule logic.
 *
 * Exactly one ETAPrediction document is written per call, whichever path ran.
 */
const calculateEta = async (trainId) => {
  const context = await buildEtaContext(trainId);
  const { train, scheduledEta } = context;

  const ruleBased = calculateRuleBasedEta(context);
  const mlResult = await predictWithMl(context);

  const usingMl = mlResult.ok;
  const prediction = usingMl ? mlResult.prediction : ruleBased;

  const document = {
    trainId: train._id,
    station: train.destination,
    scheduledEta,
    predictedEta: prediction.predictedEta,
    delayMinutes: prediction.delayMinutes,
    confidenceMinutes:
      prediction.confidenceMinutes ?? ruleBased.confidenceMinutes,
    riskLevel: prediction.riskLevel,
    mainCause: ruleBased.mainCause,
    predictionTimestamp: new Date(),
    modelVersion: prediction.modelVersion,
    predictionSource: usingMl ? "ml" : "rule-based",
    fallbackReason: usingMl ? null : mlResult.reason,
  };

  if (usingMl) {
    Object.assign(document, {
      delayCategory: prediction.delayCategory,
      delayP10Minutes: prediction.delayP10Minutes,
      delayP50Minutes: prediction.delayP50Minutes,
      delayP90Minutes: prediction.delayP90Minutes,
      probabilityDelayOver15: prediction.probabilityDelayOver15,
      trainKnownToModel: prediction.trainKnownToModel,
      dataProvenance: prediction.dataProvenance,
      beatsBaseline: prediction.beatsBaseline,
      modelNotice: prediction.modelNotice,
    });
  }

  const saved = await ETAPrediction.create(document);

  // modelStatus is returned but not persisted: it describes the service that
  // answered this request, not the prediction itself.
  return {
    ...saved.toObject(),
    modelStatus: usingMl
      ? mlResult.modelStatus
      : {
          source: "rule-based",
          reason: mlResult.reason,
          modelVersion: ruleBased.modelVersion,
        },
  };
};

module.exports = {
  calculateEta,
  buildEtaContext,
  calculateRuleBasedEta,
  parseScheduledEta,
};
