const { emitTrainUpdate } = require("../sockets/trainSocket");
const Train = require("../models/Train");
const TrainEvent = require("../models/TrainEvent");

const { updateTrainState } = require("./liveState.service");

const getLiveState = (trainEvent) => ({
  currentStation: trainEvent.station,
  location: trainEvent.location,
  speed: trainEvent.speed,
  delayMinutes: trainEvent.delayMinutes,
  timestamp: trainEvent.timestamp,
});

const ensureTrainExists = async (trainId) => {
  const train = await Train.findById(trainId);

  if (!train) {
    const error = new Error("Referenced train not found");
    error.statusCode = 404;
    throw error;
  }
};

const getTrainEvents = () =>
  TrainEvent.find().sort({ timestamp: -1 });

const getTrainEventById = (id) =>
  TrainEvent.findById(id);

const createTrainEvent = async (data) => {
  await ensureTrainExists(data.trainId);

  const trainEvent = await TrainEvent.create(data);

  await updateTrainState(
    String(trainEvent.trainId),
    getLiveState(trainEvent)
  );

  emitTrainUpdate(
    String(trainEvent.trainId),
    getLiveState(trainEvent)
  );

  return trainEvent;
};

const updateTrainEvent = async (id, data) => {
  await ensureTrainExists(data.trainId);

  const trainEvent = await TrainEvent.findByIdAndUpdate(
    id,
    data,
    {
      new: true,
      runValidators: true,
    }
  );

  if (trainEvent) {
    await updateTrainState(
      String(trainEvent.trainId),
      getLiveState(trainEvent)
    );

    emitTrainUpdate(
      String(trainEvent.trainId),
      getLiveState(trainEvent)
    );
  }

  return trainEvent;
};

const deleteTrainEvent = (id) =>
  TrainEvent.findByIdAndDelete(id);

module.exports = {
  getTrainEvents,
  getTrainEventById,
  createTrainEvent,
  updateTrainEvent,
  deleteTrainEvent,
};