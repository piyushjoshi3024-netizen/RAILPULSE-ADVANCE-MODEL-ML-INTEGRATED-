const express = require("express");
const { getETA } = require("../controllers/eta.controller");

const router = express.Router();

router.get("/:id/eta", getETA);

module.exports = router;
