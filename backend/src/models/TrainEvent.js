const mongoose = require("mongoose");

const trainEventSchema = new mongoose.Schema(
  {
    trainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Train",
      required: true,
    },

    station: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      required: true,
      trim: true,
    },

    speed: {
      type: Number,
      required: true,
      min: 0,
    },

    delayMinutes: {
      type: Number,
      default: 0,
    },

    eventType: {
      type: String,
      enum: [
        "LOCATION_UPDATE",
        "DELAY_UPDATE",
        "ARRIVAL",
        "DEPARTURE",
        "STATUS_UPDATE",
      ],
      required: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TrainEvent", trainEventSchema);