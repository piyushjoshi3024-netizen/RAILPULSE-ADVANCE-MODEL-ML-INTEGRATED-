const express = require("express");
const trainController = require("../controllers/train.controller");

const router = express.Router();

router.get("/", trainController.getTrains);
router.get("/:id/live-state", trainController.getLiveTrainState);
router.get("/:id", trainController.getTrainById);
router.post("/", trainController.createTrain);
router.put("/:id", trainController.updateTrain);
router.delete("/:id", trainController.deleteTrain);

module.exports = router;
