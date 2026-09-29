const { Server } = require("socket.io");

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("train:join", (trainId) => {
      socket.join(`train:${trainId}`);
    });

    socket.on("train:leave", (trainId) => {
      socket.leave(`train:${trainId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const emitTrainUpdate = (trainId, data) => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }

  io.to(`train:${trainId}`).emit("train:update", data);
};

const emitAlert = (data) => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }

  io.emit("alert:new", data);
};

module.exports = {
  initializeSocket,
  emitTrainUpdate,
  emitAlert,
};
