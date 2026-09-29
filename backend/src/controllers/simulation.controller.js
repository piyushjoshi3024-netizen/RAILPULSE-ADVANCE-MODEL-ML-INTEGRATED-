const simulationService = require("../services/simulation.service");

const simulatePassenger = async (req, res) => {
    const result = await simulationService.simulatePassenger(req.body);

    res.json(result);
};

const simulateStaff = async (req, res) => {
    const result = await simulationService.simulateStaff(req.body);

    res.json(result);
};

module.exports = {
    simulatePassenger,
    simulateStaff,
};