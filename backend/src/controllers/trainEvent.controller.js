const mongoose = require("mongoose");
const trainEventService = require("../services/trainEvent.service");

const validateId = (id, fieldName) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
};

const getTrainEvents = async (req, res) => {
  const events = await trainEventService.getTrainEvents();
  res.json(events);
};

const getTrainEventById = async (req, res) => {
  validateId(req.params.id, "train event ID");
  const event = await trainEventService.getTrainEventById(req.params.id);

  if (!event) {
    return res.status(404).json({ message: "Train event not found" });
  }

  res.json(event);
};

const createTrainEvent = async (req, res) => {
  validateId(req.body.trainId, "train ID");
  const event = await trainEventService.createTrainEvent(req.body);
  res.status(201).json(event);
};

const updateTrainEvent = async (req, res) => {
  console.log("UPDATE BODY:", req.body);

  validateId(req.params.id, "train event ID");
  validateId(req.body.trainId, "train ID");

  const event = await trainEventService.updateTrainEvent(
    req.params.id,
    req.body
  );

  if (!event) {
    return res.status(404).json({ message: "Train event not found" });
  }

  res.json(event);
};

const deleteTrainEvent = async (req, res) => {
  validateId(req.params.id, "train event ID");
  const event = await trainEventService.deleteTrainEvent(req.params.id);

  if (!event) {
    return res.status(404).json({ message: "Train event not found" });
  }

  res.json({ message: "Train event deleted successfully" });
};

module.exports = {
  getTrainEvents,
  getTrainEventById,
  createTrainEvent,
  updateTrainEvent,
  deleteTrainEvent,
};
