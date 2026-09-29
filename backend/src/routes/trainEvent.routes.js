const express = require("express");
const trainEventController = require("../controllers/trainEvent.controller");

const router = express.Router();

router.get("/", trainEventController.getTrainEvents);
router.get("/:id", trainEventController.getTrainEventById);
router.post("/", trainEventController.createTrainEvent);
router.put("/:id", trainEventController.updateTrainEvent);
router.delete("/:id", trainEventController.deleteTrainEvent);

module.exports = router;
