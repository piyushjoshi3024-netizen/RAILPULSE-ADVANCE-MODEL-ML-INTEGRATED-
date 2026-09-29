const Train = require("../../models/Train");
const TrainEvent = require("../../models/TrainEvent");

const getLatestEventsByTrain = (events) => {
  const latestEvents = new Map();

  events.forEach((event) => {
    const trainId = String(event.trainId);
    if (!latestEvents.has(trainId)) {
      latestEvents.set(trainId, event);
    }
  });

  return latestEvents;
};

const calculateNetworkSummary = async () => {
  const [totalTrains, trains, events] = await Promise.all([
    Train.countDocuments(),
    Train.find().select("_id").lean(),
    TrainEvent.find().sort({ timestamp: -1 }).lean(),
  ]);

  const trainIds = new Set(trains.map((train) => String(train._id)));
  const latestEvents = getLatestEventsByTrain(events);
  const activeEvents = [...latestEvents.entries()].filter(([trainId]) =>
    trainIds.has(trainId)
  );
  const delayedEvents = activeEvents.filter(
    ([, event]) => event.delayMinutes > 0
  );
  const highDelayEvents = activeEvents.filter(
    ([, event]) => event.delayMinutes > 30
  );
  const totalDelay = activeEvents.reduce(
    (total, [, event]) => total + (event.delayMinutes || 0),
    0
  );
  const activeTrains = activeEvents.length;
  const averageDelayMinutes =
    activeTrains === 0
      ? 0
      : Math.round((totalDelay / activeTrains) * 100) / 100;
  const networkStatus =
    averageDelayMinutes <= 10
      ? "LOW"
      : averageDelayMinutes <= 30
        ? "MEDIUM"
        : "HIGH";

  return {
    networkStatus,
    summary: {
      totalTrains,
      activeTrains,
      delayedTrains: delayedEvents.length,
      averageDelayMinutes,
      highDelayTrains: highDelayEvents.length,
    },
    affectedStations: [
      ...new Set(
        delayedEvents
          .map(([, event]) => event.station)
          .filter(Boolean)
      ),
    ],
    generatedAt: new Date(),
  };
};

module.exports = {
  calculateNetworkSummary,
};
