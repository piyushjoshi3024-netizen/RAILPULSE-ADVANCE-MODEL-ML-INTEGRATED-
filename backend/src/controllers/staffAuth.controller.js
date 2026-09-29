const validStaff = require("../config/staffVerification");
const {
    generateOTP,
    sendOTP,
} = require("../services/otp.service");

const User = require("../models/User");


// ===============================
// SEND STAFF OTP
// ===============================
const sendStaffOTP = async (req, res) => {
    try {
        const { employeeId, email } = req.body;

        if (!employeeId || !email) {
            return res.status(400).json({
                message: "Employee ID and email are required",
            });
        }

        // Check employee ID + email
        const staff = validStaff.find(
            (item) =>
                item.employeeId === employeeId &&
                item.email.toLowerCase() === email.toLowerCase()
        );

        if (!staff) {
            return res.status(403).json({
                message: "Invalid staff credentials",
            });
        }

        // Check whether staff account already exists
        const user = await User.findOne({
            email: email.toLowerCase(),
        });

        if (!user) {
            return res.status(404).json({
                message: "Staff account not registered yet",
            });
        }

        // Generate OTP
        const otp = generateOTP();

        // Save OTP
        user.employeeId = employeeId;
        user.role = "STAFF";
        user.otp = otp;
        user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await user.save();

        // Send OTP
        await sendOTP(email, otp);

        return res.status(200).json({
            message: "OTP sent successfully",
        });

    } catch (error) {
        console.error("SEND STAFF OTP ERROR:", error);

        return res.status(500).json({
            message: "Failed to send OTP",
            error: error.message,
        });
    }
};


// ===============================
// VERIFY STAFF OTP
// ===============================
const verifyStaffOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                message: "Email and OTP are required",
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
            role: "STAFF",
        });

        if (!user) {
            return res.status(404).json({
                message: "Staff account not found",
            });
        }

        // Check OTP
        if (user.otp !== otp) {
            return res.status(400).json({
                message: "Invalid OTP",
            });
        }

        // Check expiry
        if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
            return res.status(400).json({
                message: "OTP has expired",
            });
        }

        // Verification successful
        user.isStaffVerified = true;
        user.otp = null;
        user.otpExpiresAt = null;

        await user.save();

        return res.status(200).json({
            message: "Staff verified successfully",
        });

    } catch (error) {
        console.error("VERIFY STAFF OTP ERROR:", error);

        return res.status(500).json({
            message: "Failed to verify OTP",
            error: error.message,
        });
    }
};


// ===============================
// EXPORT
// ===============================
module.exports = {
    sendStaffOTP,
    verifyStaffOTP,
};