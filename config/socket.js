import { Server } from "socket.io";

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  const userStatuses = {};
  const connectedUsers = {};

  io.on("connection", (socket) => {
    socket.on("userLogin", (userId, isAdmin) => {
      userStatuses[userId] = true;
      socket.userId = userId;
      connectedUsers[socket.id] = userId;
      io.emit("userStatusUpdate", userStatuses);

      if (isAdmin) {
        socket.join("admin_notifications");
      }
    });

    socket.on("joinRoom", (room) => {
      socket.join(room);
    });

    socket.on("sendMessage", (data) => {
      io.to(data.room).emit("messageReceived", {
        ...data,
        senderSocketId: socket.id,
        read: false,
      });
      if (data.sender !== "admin") {
        io.to("admin_notifications").emit("adminNotification", {
          type: "newMessage",
          userId: data.sender, 
          room: data.room,
          content: data.content,
          timestamp: data.timestamp,
          sender: data.sender, 
        });
      }
    });

    socket.on("markAsRead", (data) => {
      io.to(data.room).emit("markedAsRead", data.userId);
      io.to("admin_notifications").emit("adminNotification", {
        type: "markAsRead",
        userId: data.userId,
        room: data.room,
      });
    });

    socket.on("disconnect", () => {
      const disconnectedUserId = connectedUsers[socket.id];
      if (disconnectedUserId) {
        userStatuses[disconnectedUserId] = false;
        delete connectedUsers[socket.id];
        io.emit("userStatusUpdate", userStatuses);
      }
    });
  });

  return io;
};