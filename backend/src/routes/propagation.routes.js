const express = require("express");
const { getPropagation } = require("../controllers/propagation.controller");

const router = express.Router();

router.get("/:id/propagation", getPropagation);

module.exports = router;