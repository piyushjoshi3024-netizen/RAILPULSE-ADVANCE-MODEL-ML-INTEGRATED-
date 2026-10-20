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

// Explicit collection name. The default "alerts" belongs to FastAPI, which
// reads alert_type / severity / message / created_at; this schema writes
// alertType and a trainId ObjectId, and a document of this shape in that
// collection makes the FastAPI /alerts endpoint raise a KeyError.
module.exports = mongoose.model("Alert", alertSchema, "main_alerts");