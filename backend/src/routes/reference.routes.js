const express = require("express");
const { getStations, getCorridors } = require("../controllers/reference.controller");

const router = express.Router();

// Read-only, and left open like the other data routes: route protection is
// still the unapproved D4 checkpoint, so this adds no new auth decision.
router.get("/stations", getStations);
router.get("/corridors", getCorridors);

module.exports = router;
