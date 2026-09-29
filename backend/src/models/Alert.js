const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
    {
        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true,
        },

        alertType: {
            type: String,
            enum: ["DELAY", "RISK", "BOTTLENECK", "PROPAGATION"],
            required: true,
        },

        severity: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH"],
            required: true,
        },

        message: {
            type: String,
            required: true,
            trim: true,
        },

        delayMinutes: {
            type: Number,
            default: 0,
        },

        affectedSection: {
            type: String,
            default: null,
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },
    }
);

module.exports = mongoose.model("Alert", alertSchema);