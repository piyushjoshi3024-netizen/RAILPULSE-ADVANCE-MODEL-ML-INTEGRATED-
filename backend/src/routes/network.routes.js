const express = require("express");
const { getNetworkSummary } = require("../controllers/network.controller");

const router = express.Router();

router.get("/", getNetworkSummary);

module.exports = router;
