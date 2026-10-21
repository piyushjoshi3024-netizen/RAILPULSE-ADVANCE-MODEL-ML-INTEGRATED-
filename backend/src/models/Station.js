const mongoose = require("mongoose");

/**
 * A station and where it is.
 *
 * This is static reference geography, not live data: nothing about a station
 * changes while trains run. It exists because neither database held a single
 * coordinate -- the two map pages each carried their own copy in the source --
 * and a map cannot be dynamic without one authoritative list.
 */
const stationSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        lat: {
            type: Number,
            required: true,
            min: -90,
            max: 90,
        },

        lng: {
            type: Number,
            required: true,
            min: -180,
            max: 180,
        },

        zone: {
            type: String,
            trim: true,
            default: "",
        },

        // "SEED" marks a row the demo seed wrote, which is also the only thing
        // the seed's --reset is allowed to delete.
        dataSource: {
            type: String,
            enum: ["SEED", "MANUAL"],
            default: "MANUAL",
        },
    },
    { timestamps: true }
);

// Explicit collection name, matching main_users and main_alerts: the Express
// API shares the ML service's database, so every collection it owns is
// prefixed and cannot collide with one FastAPI reads.
module.exports = mongoose.model("Station", stationSchema, "main_stations");
