const {
  calculatePropagation,
} = require("../operations/propagation/propagation.service");

const getPropagation = async (req, res, next) => {
  try {
    const propagation = await calculatePropagation(req.params.id);
    res.status(200).json(propagation);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPropagation,
};
