const express = require("express");
const { getRisk } = require("../controllers/risk.controller");

const router = express.Router();

router.get("/:id/risk", getRisk);

module.exports = router;