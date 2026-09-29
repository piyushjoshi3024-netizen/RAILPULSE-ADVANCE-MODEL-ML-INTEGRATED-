const mongoose = require("mongoose");

const etaPredictionSchema = new mongoose.Schema(
  {
    trainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Train",
      required: true,
    },
    station: {
      type: String,
      required: true,
    },
    scheduledEta: Date,
    predictedEta: {
      type: Date,
      required: true,
    },
    delayMinutes: {
      type: Number,
      default: 0,
    },
    confidenceMinutes: {
      type: Number,
      default: 0,
    },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
    mainCause: String,
    predictionTimestamp: {
      type: Date,
      default: Date.now,
    },
    modelVersion: {
      type: String,
      default: "v1-rule-based",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ETAPrediction", etaPredictionSchema);
