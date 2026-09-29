
const mongoose = require("mongoose");
const trainService = require("../services/train.service");
const liveStateService = require("../services/liveState.service");

const validateId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid train ID");
    error.statusCode = 400;
    throw error;
  }
};

const getTrains = async (req, res) => {
  const trains = await trainService.getTrains();
  res.json(trains);
};

const getTrainById = async (req, res) => {
  validateId(req.params.id);
  const train = await trainService.getTrainById(req.params.id);

  if (!train) {
    return res.status(404).json({ message: "Train not found" });
  }

  res.json(train);
};

const createTrain = async (req, res) => {
  console.log("BODY RECEIVED:", req.body);

  const train = await trainService.createTrain(req.body);

  res.status(201).json(train);
};
const updateTrain = async (req, res) => {
  validateId(req.params.id);
  const train = await trainService.updateTrain(req.params.id, req.body);

  if (!train) {
    return res.status(404).json({ message: "Train not found" });
  }

  res.json(train);
};

const deleteTrain = async (req, res) => {
  validateId(req.params.id);
  const train = await trainService.deleteTrain(req.params.id);

  if (!train) {
    return res.status(404).json({ message: "Train not found" });
  }

  res.json({ message: "Train deleted successfully" });
};
const getLiveTrainState = async (req, res) => {
  validateId(req.params.id);

  const state = await liveStateService.getTrainState(req.params.id);

  if (!state) {
    return res.status(404).json({ message: "Live state not found" });
  }

  res.json(state);
};

module.exports = {
  getTrains,
  getTrainById,
  createTrain,
  updateTrain,
  deleteTrain,
  getLiveTrainState,
};
