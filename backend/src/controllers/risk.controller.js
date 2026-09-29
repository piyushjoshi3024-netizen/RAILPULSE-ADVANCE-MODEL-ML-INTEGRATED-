const { calculateRisk } = require("../operations/risk/risk.service");

const getRisk = async (req, res, next) => {
  try {
    const assessment = await calculateRisk(req.params.id);
    res.status(200).json(assessment);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRisk,
};
