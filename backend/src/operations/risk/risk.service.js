const ETAPrediction = require("../../models/ETAPrediction");
const RiskAssessment = require("../../models/RiskAssessment");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const calculateRisk = async (trainId) => {
  const etaPrediction = await ETAPrediction.findOne({ trainId }).sort({
    predictionTimestamp: -1,
  });

  if (!etaPrediction) {
    throw createError("ETA prediction not found", 404);
  }

  const delayMinutes = etaPrediction.delayMinutes;
  const riskScore =
    delayMinutes <= 10 ? 20 : delayMinutes <= 30 ? 50 : 85;
  const riskLevel =
    riskScore <= 30 ? "LOW" : riskScore <= 60 ? "MEDIUM" : "HIGH";

  const reason =
    riskLevel === "LOW"
      ? "Minor or no delay"
      : riskLevel === "MEDIUM"
        ? "Moderate delay"
        : "Severe delay";

  return RiskAssessment.create({
    trainId,
    riskLevel,
    riskScore,
    delayMinutes,
    reason,
    assessmentTimestamp: new Date(),
  });
};

module.exports = {
  calculateRisk,
};
