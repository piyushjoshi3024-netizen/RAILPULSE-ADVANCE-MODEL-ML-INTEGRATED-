const express = require("express");
const { getBottleneck } = require("../controllers/bottleneck.controller");

const router = express.Router();

router.get("/:id/bottleneck", getBottleneck);

module.exports = router;