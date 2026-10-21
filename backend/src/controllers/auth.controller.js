const authService = require("../services/auth.service");
const validStaff = require("../config/staffVerification");

// ===============================
// PASSWORD VALIDATION
// ===============================

const isStrongPassword = (password) => {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
};

// ===============================
// PUBLIC / PASSENGER REGISTER
// ===============================

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number",
      });
    }

    // Public registration is ALWAYS PASSENGER
    const user = await authService.registerUser({
      name,
      email,
      password,
      role: "PASSENGER",
    });

    return res.status(201).json({
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Registration failed",
    });
  }
};

// ===============================
// STAFF REGISTER
// ===============================

const registerStaff = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      employeeId,
    } = req.body;

    if (!name || !email || !password || !employeeId) {
      return res.status(400).json({
        message:
          "Name, email, password and employee ID are required",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number",
      });
    }

    // Check employee ID + authorized staff email
    const staff = validStaff.find(
      (employee) =>
        employee.employeeId === employeeId &&
        employee.email.toLowerCase() === email.toLowerCase()
    );

    if (!staff) {
      return res.status(403).json({
        message: "Invalid employee ID or email",
      });
    }

    // Create STAFF account
    const user = await authService.registerUser({
      name,
      email,
      password,
      role: "STAFF",
      employeeId,
    });

    return res.status(201).json({
      message: "Staff registered successfully",
      user,
    });
  } catch (error) {
    console.error("STAFF REGISTER ERROR:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Staff registration failed",
    });
  }
};

// ===============================
// LOGIN
// ===============================

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const result = await authService.loginUser({
      email,
      password,
    });

    return res.json({
      message: "Login successful",
      ...result,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Login failed",
    });
  }
};

// ===============================
// GET CURRENT USER
// ===============================

/**
 * Legacy. FastAPI is the identity provider now, and Node has no record of the
 * people it authenticates, so the verified token's own claims are the only
 * thing this endpoint can honestly answer with. The browser reads the full
 * profile from FastAPI's /auth/me instead.
 */
const getMe = async (req, res) => {
  return res.json({
    message: "Authenticated user",
    user: req.user,
    identityProvider: "fastapi",
  });
};

// ===============================
// EXPORT
// ===============================

module.exports = {
  register,
  registerStaff,
  login,
  getMe,
};