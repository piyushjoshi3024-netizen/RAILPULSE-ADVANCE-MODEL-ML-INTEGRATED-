const express = require("express");
const { getETA } = require("../controllers/eta.controller");
const authenticate = require("../../middleware/auth");

const router = express.Router();

// ETA is served to any authenticated role. Node stays the only auth boundary
// the browser sees; the ML service is reached with a server-side service
// account and is never exposed directly.
router.get("/:id/eta", authenticate, getETA);

module.exports = router;
