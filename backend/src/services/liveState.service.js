const redisClient = require("../config/redis");

const getTrainKey = (trainId) => `train:live:${trainId}`;

const updateTrainState = async (trainId, state) => {
  await redisClient.set(getTrainKey(trainId), JSON.stringify(state));
};

const getTrainState = async (trainId) => {
  const value = await redisClient.get(getTrainKey(trainId));
  return value === null ? null : JSON.parse(value);
};

const removeTrainState = async (trainId) => {
  await redisClient.del(getTrainKey(trainId));
};

module.exports = {
  updateTrainState,
  getTrainState,
  removeTrainState,
};