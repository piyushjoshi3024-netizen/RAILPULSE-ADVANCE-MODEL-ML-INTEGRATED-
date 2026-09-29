require("dotenv").config();

const dns = require("dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);

console.log("JWT SECRET LOADED:", !!process.env.JWT_SECRET);

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
require("./config/redis");
const { initializeSocket } = require("./sockets/trainSocket");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

initializeSocket(server);

const startServer = async () => {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});


