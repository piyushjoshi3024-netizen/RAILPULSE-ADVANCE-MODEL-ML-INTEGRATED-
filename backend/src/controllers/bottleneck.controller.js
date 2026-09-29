const { detectBottleneck } = require("../operations/bottleneck/bottleneck.service");

const getBottleneck = async (req, res, next) => {
  try {
    const bottleneck = await detectBottleneck(req.params.id);

    res.status(200).json(bottleneck);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBottleneck,
};