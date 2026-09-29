const mongoose = require("mongoose");

const journeySchema = new mongoose.Schema(
    {
        source: {
            type: String,
            required: true,
            trim: true,
        },

        destination: {
            type: String,
            required: true,
            trim: true,
        },

        date: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Journey", journeySchema);