const {
    calculateRecovery,
} = require("../operations/recovery/recovery.service");

const getRecovery = async (req, res, next) => {
    try {
        const result = await calculateRecovery(req.params.trainId);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRecovery,
};