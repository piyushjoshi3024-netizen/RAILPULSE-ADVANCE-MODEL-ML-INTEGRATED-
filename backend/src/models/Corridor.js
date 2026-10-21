const mongoose = require("mongoose");

/**
 * A named route, stored as the ordered station codes it passes through.
 *
 * The coordinates deliberately live only in main_stations. A corridor that
 * carried its own copy of the geometry would be a second source of truth for
 * the same points, and the two would drift. The client resolves
 * `stations` through the station list to draw the line.
 */
const corridorSchema = new mongoose.Schema(
    {
        corridorId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        stations: {
            type: [String],
            required: true,
            validate: {
                validator: (codes) => Array.isArray(codes) && codes.length >= 2,
                message: "A corridor needs at least two station codes",
            },
        },

        dataSource: {
            type: String,
            enum: ["SEED", "MANUAL"],
            default: "MANUAL",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Corridor", corridorSchema, "main_corridors");
