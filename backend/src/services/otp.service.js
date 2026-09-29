const nodemailer = require("nodemailer");

console.log("EMAIL USER:", process.env.EMAIL_USER);
console.log("EMAIL PASS LOADED:", !!process.env.EMAIL_PASS);

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendOTP = async (email, otp) => {
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "RailPulse Staff Verification OTP",
        text: `Your RailPulse Staff Verification OTP is ${otp}. It is valid for 5 minutes.`,
    });

    console.log(`OTP sent to ${email}`);
};

module.exports = {
    generateOTP,
    sendOTP,
};