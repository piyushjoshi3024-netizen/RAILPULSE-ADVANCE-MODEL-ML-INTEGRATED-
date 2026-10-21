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

    // Marks a row written by scripts/seed-demo.js. Mongoose drops unknown
    // fields in strict mode, so without this the seed's --reset would match
    // nothing and silently refuse to clean up after itself.
    dataSource: {
      type: String,
      enum: ["SEED", "MANUAL"],
      default: "MANUAL",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Train", trainSchema);
