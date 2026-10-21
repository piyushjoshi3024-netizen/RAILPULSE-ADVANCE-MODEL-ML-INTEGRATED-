const Station = require("../models/Station");
const Corridor = require("../models/Corridor");

/**
 * Static reference geography: stations and the corridors joining them.
 *
 * Both reads are sorted so the map draws in a stable order, and `.lean()`
 * because nothing here is ever modified through a document.
 */
const getStations = async () => {
    return Station.find()
        .select("code name lat lng zone dataSource")
        .sort({ code: 1 })
        .lean();
};

const getCorridors = async () => {
    return Corridor.find()
        .select("corridorId name stations dataSource")
        .sort({ corridorId: 1 })
        .lean();
};

module.exports = { getStations, getCorridors };
