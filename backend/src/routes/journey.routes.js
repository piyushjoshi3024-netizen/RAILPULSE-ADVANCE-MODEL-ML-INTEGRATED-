const express = require("express");
const journeyController = require("../controllers/journey.controller");

const router = express.Router();

router.post("/plan", journeyController.planJourney);

module.exports = router;