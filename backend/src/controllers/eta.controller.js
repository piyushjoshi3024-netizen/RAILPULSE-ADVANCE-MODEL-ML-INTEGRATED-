const { calculateEta } = require("../services/eta.service");

const getETA = async (req, res, next) => {
  try {
    const prediction = await calculateEta(req.params.id);
    res.json(prediction);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getETA,
};
