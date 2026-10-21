const express = require("express");

const {
    sendStaffOTP,
    verifyStaffOTP,
} = require("../controllers/staffAuth.controller");

const gone = require("../../middleware/gone");

const router = express.Router();

// Retired with the rest of the Express identity surface. Staff accounts are
// created by an administrator in the prediction service; this flow also never
// had mail credentials configured, so it could not deliver a code anyway.
const RETIRED = "This endpoint has been retired. Railway staff accounts are created by an administrator.";

router.post("/send-otp", gone(RETIRED));

router.post("/verify-otp", gone(RETIRED));

module.exports = router;