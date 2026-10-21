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

const referenceRoutes = require("./routes/reference.routes");

const apiGuard = require("../middleware/apiGuard");

const staffAuthRoutes = require("./routes/staffAuth.routes");

const app = express();

// Middleware

app.use(cors());

app.use(express.json());

// Route protection (D4). One rule for everything under /api, applied before
// any route is mounted: see middleware/apiGuard.js for the three levels and
// the two exceptions, and tests/apiGuard.test.js for the table.
app.use(apiGuard);

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

// Static reference geography (stations, corridors)

app.use("/api", referenceRoutes);

/**
 * Unknown API routes answer JSON, not Express's HTML 404 page.
 *
 * The client parses every response as JSON, so an HTML body turned "that route
 * does not exist" into a syntax error on the user's screen -- the exact
 * failure services/authService.js had to work around.
 */
app.use("/api", (req, res) => {
  res.status(404).json({
    message: `No such endpoint: ${req.method} ${req.originalUrl}`,
  });
});

/**
 * The error handler.
 *
 * Without one, Express's default handler returned an HTML page with a full
 * stack trace -- file paths and all -- for every failure, including ordinary
 * 404s like "Live state not found". It now answers the status the thrower
 * chose, as JSON, and the stack stays in the server log.
 */
app.use((error, req, res, next) => {
  const status = Number(error.statusCode) || 500;

  if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl} failed:`, error.stack);
  }

  res.status(status).json({
    message: status >= 500 ? "Internal server error" : error.message,
  });
});

module.exports = app;