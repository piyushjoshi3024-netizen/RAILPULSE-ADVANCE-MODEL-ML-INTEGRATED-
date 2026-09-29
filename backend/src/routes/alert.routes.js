const express = require("express");
const {
    getAlert,
    getAllAlerts,
} = require("../controllers/alert.controller");

const router = express.Router();

router.get("/", getAllAlerts);

router.get("/:trainId", getAlert);

module.exports = router;