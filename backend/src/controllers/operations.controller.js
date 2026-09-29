const { calculateRisk } = require("../operations/risk/risk.service");
const { detectBottleneck } = require("../operations/bottleneck/bottleneck.service");
const {
  calculatePropagation,
} = require("../operations/propagation/propagation.service");
const {
  calculateRecovery,
} = require("../operations/recovery/recovery.service");
const getRisk = async (req, res, next) => {
  try {
    const result = await calculateRisk(req.params.trainId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getBottleneck = async (req, res, next) => {
  try {
    const result = await detectBottleneck(req.params.trainId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getPropagation = async (req, res, next) => {
  try {
    const result = await calculatePropagation(req.params.trainId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getRecovery = async (req, res, next) => {
  try {
    const result = await calculateRecovery(req.params.trainId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRisk,
  getBottleneck,
  getPropagation,
  getRecovery,
};
