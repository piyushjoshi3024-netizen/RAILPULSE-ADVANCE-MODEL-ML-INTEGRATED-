const mongoose = require("mongoose");

const Train = require("../models/Train");
const Simulation = require("../models/Simulation");
const ETAPrediction = require("../models/ETAPrediction");

const { getTrainState } = require("./liveState.service");

const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const getRiskLevel = (delayMinutes) => {
    if (delayMinutes > 30) return "HIGH";
    if (delayMinutes > 10) return "MEDIUM";
    return "LOW";
};

const simulateTrain = async (data, role) => {
    const { trainId, additionalDelayMinutes } = data;

    if (!trainId || additionalDelayMinutes === undefined) {
        throw createError(
            "trainId and additionalDelayMinutes are required",
            400
        );
    }

    if (!mongoose.isValidObjectId(trainId)) {
        throw createError("Invalid train ID", 400);
    }

    if (
        typeof additionalDelayMinutes !== "number" ||
        additionalDelayMinutes < 0
    ) {
        throw createError(
            "additionalDelayMinutes must be a non-negative number",
            400
        );
    }

    const train = await Train.findById(trainId);

    if (!train) {
        throw createError("Train not found", 404);
    }

    const liveState = await getTrainState(String(train._id));

    const prediction = await ETAPrediction.findOne({
        trainId: train._id,
    }).sort({
        predictionTimestamp: -1,
        createdAt: -1,
    });

    const currentDelay =
        liveState?.delayMinutes ?? prediction?.delayMinutes ?? 0;

    const currentRisk =
        prediction?.riskLevel ?? getRiskLevel(currentDelay);

    const simulatedDelay =
        currentDelay + additionalDelayMinutes;

    const simulatedRisk = getRiskLevel(simulatedDelay);

    const result = {
        trainNumber: train.trainNumber,
        trainName: train.trainName,
        currentDelay,
        simulatedDelay,
        currentRisk,
        simulatedRisk,
        impact:
            additionalDelayMinutes === 0
                ? "No additional delay impact"
                : `Train may experience an additional ${additionalDelayMinutes} minutes of delay`,
        affectedStations: train.route
            ? train.route.map((routeItem) => routeItem.station)
            : [],
    };

    if (role === "STAFF" || role === "ADMIN") {
        result.bottleneckImpact =
            simulatedRisk === "HIGH"
                ? "High possibility of operational congestion"
                : simulatedRisk === "MEDIUM"
                    ? "Moderate possibility of congestion"
                    : "Low operational impact";

        result.propagationImpact =
            additionalDelayMinutes > 20
                ? "Delay may propagate to following trains"
                : additionalDelayMinutes > 0
                    ? "Limited delay propagation expected"
                    : "No additional propagation expected";

        result.recommendedResponse =
            simulatedRisk === "HIGH"
                ? "Consider operational intervention and monitor affected sections"
                : simulatedRisk === "MEDIUM"
                    ? "Monitor train and surrounding traffic"
                    : "Continue normal monitoring";
    }

    await Simulation.create({
        role,
        scenario: "ADDITIONAL_DELAY",
        input: {
            trainId,
            additionalDelayMinutes,
        },
        result,
    });

    return result;
};

const simulatePassenger = (data) =>
    simulateTrain(data, "PASSENGER");

const simulateStaff = (data) =>
    simulateTrain(data, "STAFF");

module.exports = {
    simulatePassenger,
    simulateStaff,
};