const express = require("express");

const {
  register,
  registerStaff,
  login,
  getMe,
} = require("../controllers/auth.controller");

const authenticate = require("../../middleware/auth");
const authorize = require("../../middleware/rbac");
const gone = require("../../middleware/gone");

// Retired: FastAPI registers users and issues tokens for both applications.
// The controllers above are still imported so the implementation stays
// readable and revivable, but nothing routes to them any more.
const RETIRED = "This endpoint has been retired. RailPulse accounts are created and signed in through the prediction service at /api/v1/auth.";

const router = express.Router();

router.post("/register", gone(RETIRED));

router.post("/register-staff", gone("This endpoint has been retired. Railway staff accounts are created by an administrator."));

router.post("/login", gone(RETIRED));

router.get("/me", authenticate, getMe);

router.get(
  "/test/passenger",
  authenticate,
  authorize("PASSENGER"),
  (req, res) => {
    res.json({
      message: "Passenger access granted",
    });
  }
);

router.get(
  "/test/staff",
  authenticate,
  authorize("STAFF"),
  (req, res) => {
    res.json({
      message: "Staff access granted",
    });
  }
);

router.get(
  "/test/admin",
  authenticate,
  authorize("ADMIN"),
  (req, res) => {
    res.json({
      message: "Admin access granted",
    });
  }
);

module.exports = router;