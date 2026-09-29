const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["PASSENGER", "STAFF", "ADMIN"],
      default: "PASSENGER",
    },
// staff having a unique employeeId, while passengers do not have one. The employeeId field is optional and only applicable to staff members.
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // staff must complete OTP Verification

    isStaffVerified: {
      type: Boolean,
      default: false,
    },
    // temp otp 

    otp: {
      type: String,
      default: null,
    },  
    
    //OTP expiry time

    otpExpiresAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
