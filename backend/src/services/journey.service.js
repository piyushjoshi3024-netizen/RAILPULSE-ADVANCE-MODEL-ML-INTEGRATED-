const Train = require("../models/Train");
const Journey = require("../models/Journey");
const ETAPrediction = require("../models/ETAPrediction");

const { getTrainState } = require("./liveState.service");

const createError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};
const calculateDistance = (route, sourceIndex, destinationIndex) => {
    return route
        .slice(sourceIndex + 1, destinationIndex + 1)
        .reduce(
            (total, routeItem) =>
                total + (routeItem.distanceFromPrevious || 0),
            0
        );
};

const calculateDuration = (departure, arrival) => {
    if (!departure || !arrival) {
        return "--";
    }

    const [departureHour, departureMinute] = departure
        .split(":")
        .map(Number);

    const [arrivalHour, arrivalMinute] = arrival
        .split(":")
        .map(Number);

    let departureMinutes =
        departureHour * 60 + departureMinute;

    let arrivalMinutes =
        arrivalHour * 60 + arrivalMinute;

    if (arrivalMinutes < departureMinutes) {
        arrivalMinutes += 24 * 60;
    }

    const durationMinutes =
        arrivalMinutes - departureMinutes;

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
};
const planJourney = async (data) => {
    const { source, destination, date } = data;

    if (!source || !destination || !date) {
        throw createError(
            "Source, destination and date are required",
            400
        );
    }

    const journeyDate = new Date(date);

    if (Number.isNaN(journeyDate.getTime())) {
        throw createError("Invalid date", 400);
    }

    await Journey.create({
        source,
        destination,
        date: journeyDate,
    });

    const trains = await Train.find();

    const matchingTrains = trains.filter((train) => {
        const sourceIndex = train.route.findIndex(
            (routeItem) => routeItem.station === source
        );

        const destinationIndex = train.route.findIndex(
            (routeItem) => routeItem.station === destination
        );

        return (
            sourceIndex !== -1 &&
            destinationIndex !== -1 &&
            sourceIndex < destinationIndex
        );
    });

    if (matchingTrains.length === 0) {
        throw createError(
            "No trains found for this journey",
            404
        );
    }

    const options = await Promise.all(
        matchingTrains.map(async (train) => {
            const liveState = await getTrainState(String(train._id));

            const prediction = await ETAPrediction.findOne({
                trainId: train._id,
                station: destination,
            }).sort({
                predictionTimestamp: -1,
                createdAt: -1,
            });
            const sourceIndex = train.route.findIndex(
                (routeItem) => routeItem.station === source
            );

            const destinationIndex = train.route.findIndex(
                (routeItem) => routeItem.station === destination
            );

            const sourceRoute = train.route[sourceIndex];
            const destinationRoute = train.route[destinationIndex];

            const distance = calculateDistance(
                train.route,
                sourceIndex,
                destinationIndex
            );

            const duration = calculateDuration(
                sourceRoute?.scheduledDeparture,
                destinationRoute?.scheduledArrival
            );

            return {
                trainNumber: train.trainNumber,
                trainName: train.trainName,
                type: train.trainType || null,
                status: train.status || null,
                source,
                destination,
                departure: sourceRoute?.scheduledDeparture || null,
                arrival: destinationRoute?.scheduledArrival || null,
                distance,
                duration,
                stations: train.route
                    .slice(sourceIndex, destinationIndex + 1)
                    .map((routeItem) => routeItem.station),
                currentDelay: liveState?.delayMinutes ?? 0,
                predictedDelay: prediction?.delayMinutes ?? null,
                risk: prediction?.riskLevel ?? null,
                estimatedArrival: prediction?.predictedEta ?? null,
            };
        })
    );

    return {
        source,
        destination,
        date,
        options,
    };
};

module.exports = {
    planJourney,
};