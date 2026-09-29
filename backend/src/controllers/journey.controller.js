const journeyService = require("../services/journey.service");

const planJourney = async (req, res) => {
    const journey = await journeyService.planJourney(req.body);
    res.json(journey);
};

module.exports = {
    planJourney,
};