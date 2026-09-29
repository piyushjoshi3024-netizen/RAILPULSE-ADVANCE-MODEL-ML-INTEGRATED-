const mongoose = require("mongoose");

const simulationSchema = new mongoose.Schema(
    {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        role: {
            type: String,
            enum: ["PASSENGER", "STAFF", "ADMIN"],
        },

        scenario: {
            type: String,
            required: true,
        },

        input: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        result: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Simulation", simulationSchema);