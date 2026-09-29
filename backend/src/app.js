const express = require("express");

const cors = require("cors");

const trainRoutes = require("./routes/train.routes");

const etaRoutes = require("./routes/eta.routes");

const trainEventRoutes = require("./routes/trainEvent.routes");

const operationsRoutes = require("./routes/operations.routes");

const networkRoutes = require("./routes/network.routes");

const authRoutes = require("./routes/auth.routes");

const journeyRoutes = require("./routes/journey.routes");

const simulationRoutes = require("./routes/simulation.routes");

const alertRoutes = require("./routes/alert.routes");

const staffAuthRoutes = require("./routes/staffAuth.routes");

const app = express();

// Middleware

app.use(cors());

app.use(express.json());

// Health Check

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
  });
});

// Train Routes

app.use("/api/trains", trainRoutes);

// ETA Routes

app.use("/api/trains", etaRoutes);

// Train Event Routes

app.use("/api/train-events", trainEventRoutes);

// Operations Routes

app.use("/api/operations", operationsRoutes);

app.use("/api/operations/network", networkRoutes);

// Authentication Routes

app.use("/api/auth", authRoutes);

// Staff Authentication Routes

app.use("/api/staff-auth", staffAuthRoutes);

// Journey Routes

app.use("/api/journey", journeyRoutes);

// Simulation Routes

app.use("/api/simulation", simulationRoutes);

// Alert Routes

app.use("/api/alerts", alertRoutes);

module.exports = app;