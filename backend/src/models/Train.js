const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    station: String,
    sequence: Number,
    scheduledArrival: String,
    scheduledDeparture: String,
    distanceFromPrevious: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const trainSchema = new mongoose.Schema(
  {
    trainNumber: {
      type: String,
      required: true,
      unique: true,
    },
    trainName: {
      type: String,
      required: true,
    },
    trainType: {
      type: String,
      enum: ["EXPRESS", "SUPERFAST", "PASSENGER", "FREIGHT", "SPECIAL"],
    },
    source: {
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
    route: [routeSchema],
    status: {
      type: String,
      enum: ["RUNNING", "DELAYED", "AT_STATION", "CANCELLED", "COMPLETED"],
    },
    currentStation: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Train", trainSchema);
