const express = require("express");

const {
    sendStaffOTP,
    verifyStaffOTP,
} = require("../controllers/staffAuth.controller");

const router = express.Router();

router.post("/send-otp", sendStaffOTP);

router.post("/verify-otp", verifyStaffOTP);

module.exports = router;