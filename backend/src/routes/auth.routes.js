const express = require("express");

const {
  register,
  registerStaff,
  login,
  getMe,
} = require("../controllers/auth.controller");

const authenticate = require("../../middleware/auth");
const authorize = require("../../middleware/rbac");

const router = express.Router();

router.post("/register", register);

router.post("/register-staff", registerStaff);

router.post("/login", login);

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