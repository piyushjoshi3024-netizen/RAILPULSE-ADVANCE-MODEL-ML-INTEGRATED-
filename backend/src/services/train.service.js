const Train = require("../models/Train");

const getTrains = () => Train.find().sort({ createdAt: -1 });

const getTrainById = (id) => Train.findById(id);

const createTrain = (data) => Train.create(data);

const updateTrain = (id, data) =>
  Train.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

const deleteTrain = (id) => Train.findByIdAndDelete(id);

module.exports = {
  getTrains,
  getTrainById,
  createTrain,
  updateTrain,
  deleteTrain,
};
