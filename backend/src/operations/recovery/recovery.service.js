const Train = require("../../models/Train");
const Recovery = require("../../models/Recovery");

const { getTrainState } = require("../../services/liveState.service");

const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const calculateRecovery = async (trainId) => {
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

    const riskLevel =
        delayMinutes <= 10
            ? "LOW"
            : delayMinutes <= 30
                ? "MEDIUM"
                : "HIGH";

    let recoveryAction;
    let reason;

    if (riskLevel === "LOW") {
        recoveryAction = "Continue normal operation";
        reason = "Minor or no delay";
    } else if (riskLevel === "MEDIUM") {
        recoveryAction = "Monitor train and consider retiming";
        reason = "Moderate delay may affect downstream operations";
    } else {
        recoveryAction =
            "Operational intervention required";
        reason =
            "Severe delay may cause congestion and delay propagation";
    }

    return Recovery.create({
        trainId,
        currentDelay: delayMinutes,
        riskLevel,
        recoveryAction,
        reason,
        affectedSection: `${liveState.currentStation} → ${nextStation}`,
    });
};

module.exports = {
    calculateRecovery,
};