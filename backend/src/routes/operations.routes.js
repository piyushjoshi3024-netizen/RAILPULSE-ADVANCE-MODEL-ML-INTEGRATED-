const express = require("express");
const {
  getRisk,
  getBottleneck,
  getPropagation,
  getRecovery,
} = require("../controllers/operations.controller");

const router = express.Router();

router.get("/risk/:trainId", getRisk);
router.get("/bottleneck/:trainId", getBottleneck);
router.get("/propagation/:trainId", getPropagation);
router.get("/recovery/:trainId", getRecovery);

module.exports = router;
