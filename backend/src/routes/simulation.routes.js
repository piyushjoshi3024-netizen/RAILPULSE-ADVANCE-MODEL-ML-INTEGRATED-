const express = require("express");

const simulationController = require("../controllers/simulation.controller");

const router = express.Router();

router.post(
    "/passenger",
    simulationController.simulatePassenger
);

router.post(
    "/staff",
    simulationController.simulateStaff
);

module.exports = router;