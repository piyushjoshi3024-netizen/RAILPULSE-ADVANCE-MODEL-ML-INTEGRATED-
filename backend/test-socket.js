const { io } = require("socket.io-client");

const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("✅ Connected to Socket.IO");
  console.log("Socket ID:", socket.id);

  const trainId = "6a9d5aa7a663314c1afeaa71";

  socket.emit("train:join", trainId);

  console.log(`🚆 Joined train room: train:${trainId}`);
});

socket.on("train:update", (data) => {
  console.log("📡 Train update received:");
  console.log(data);
});

socket.on("alert:new", (data) => {
  console.log("🚨 Alert received:");
  console.log(data);
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from Socket.IO");
});

socket.on("connect_error", (error) => {
  console.log("❌ Connection error:", error.message);
});