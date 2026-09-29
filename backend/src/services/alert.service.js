const Train = require("../models/Train");
const Alert = require("../models/Alert");

const { getTrainState } = require("./liveState.service");
const { emitAlert } = require("../sockets/trainSocket");

const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const generateAlert = async (trainId) => {
    const train = await Train.findById(trainId);

    if (!train) {
        throw createError("Train not found", 404);
    }

    const liveState = await getTrainState(String(trainId));

    if (!liveState) {
        throw createError("Live state not found", 404);
    }

    const delayMinutes = liveState.delayMinutes || 0;

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

    const nextStation =
        train.route[currentIndex + 1]?.station;

    const affectedSection = nextStation
        ? `${liveState.currentStation} → ${nextStation}`
        : liveState.currentStation;

    let severity;
    let message;

    if (delayMinutes <= 10) {
        severity = "LOW";
        message = "Train is operating normally";
    } else if (delayMinutes <= 30) {
        severity = "MEDIUM";
        message = "Train is experiencing a moderate delay";
    } else {
        severity = "HIGH";
        message = "Train is experiencing a severe delay";
    }

    const alert = await Alert.create({
        trainId,
        alertType: "DELAY",
        severity,
        message,
        delayMinutes,
        affectedSection,
    });

    emitAlert(alert);

    return alert;
};

const getAllAlerts = async () => {
    return Alert.find().sort({ createdAt: -1 });
};

module.exports = {
    generateAlert,
    getAllAlerts,
};