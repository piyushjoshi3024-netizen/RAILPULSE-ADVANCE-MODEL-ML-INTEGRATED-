const alertService = require("../services/alert.service");

const getAlert = async (req, res, next) => {
    try {
        const result = await alertService.generateAlert(
            req.params.trainId
        );

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const getAllAlerts = async (req, res, next) => {
    try {
        const result = await alertService.getAllAlerts();

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAlert,
    getAllAlerts,
};