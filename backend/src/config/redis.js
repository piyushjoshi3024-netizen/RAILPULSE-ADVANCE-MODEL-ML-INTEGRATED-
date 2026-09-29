const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (error) => {
  console.error(`Redis connection failed: ${error.message}`);
});

if (!redisClient.isOpen) {
  redisClient.connect()
    .then(() => {
      console.log("Redis connected");
    })
    .catch((error) => {
      console.error(`Redis connection failed: ${error.message}`);
    });
}

module.exports = redisClient;
