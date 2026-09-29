const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  try {
    console.log("JWT SECRET EXISTS:", !!process.env.JWT_SECRET);

    const authHeader = req.headers.authorization;

    console.log("AUTH HEADER:", authHeader ? "Received" : "Missing");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication token required",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    console.log("JWT VERIFIED:", decoded);

    req.user = decoded;

    next();
  } catch (error) {
    console.error("AUTH ERROR:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

module.exports = authenticate;