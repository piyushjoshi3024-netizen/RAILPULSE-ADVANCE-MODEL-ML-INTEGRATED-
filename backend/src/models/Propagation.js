const mongoose = require("mongoose");

const affectedStationSchema = new mongoose.Schema(
  {
    station: String,
    estimatedDelayMinutes: Number,
    impactLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
  },
  { _id: false }
);

const propagationSchema = new mongoose.Schema(
  {
    trainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Train",
      required: true,
    },
    fromStation: {
      type: String,
      required: true,
    },
    affectedStations: [affectedStationSchema],
    totalAffectedStations: {
      type: Number,
      default: 0,
    },
    propagationScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    reason: String,
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Propagation", propagationSchema);
