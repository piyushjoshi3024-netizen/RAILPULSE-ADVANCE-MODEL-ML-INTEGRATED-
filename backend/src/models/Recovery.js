const mongoose = require("mongoose");

const recoverySchema = new mongoose.Schema(
    {
        trainId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Train",
            required: true,
        },

        currentDelay: {
            type: Number,
            required: true,
        },

        riskLevel: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH"],
            required: true,
        },

        recoveryAction: {
            type: String,
            required: true,
        },

        reason: {
            type: String,
            required: true,
        },

        affectedSection: {
            type: String,
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },
    }
);

module.exports = mongoose.model("Recovery", recoverySchema);