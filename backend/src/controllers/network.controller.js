const { calculateNetworkSummary } = require("../operations/network/network.service");

const getNetworkSummary = async (req, res, next) => {
  try {
    const summary = await calculateNetworkSummary();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNetworkSummary,
};
