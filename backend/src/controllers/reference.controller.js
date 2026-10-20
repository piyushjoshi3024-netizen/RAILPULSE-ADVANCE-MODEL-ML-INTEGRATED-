const referenceService = require("../services/reference.service");

const getStations = async (req, res) => {
    const stations = await referenceService.getStations();
    res.json(stations);
};

const getCorridors = async (req, res) => {
    const corridors = await referenceService.getCorridors();
    res.json(corridors);
};

module.exports = { getStations, getCorridors };
