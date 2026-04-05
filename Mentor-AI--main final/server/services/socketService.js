// server/services/socketService.js
const { Server } = require("socket.io");
const { logger } = require("../utils/logger");

let io;

/**
 * Initialize Socket.io server
 * @param {object} server - HTTP server instance
 */
function initSocket(server) {
    io = new Server(server, {
        cors: {
            origin: "*", // Adjust in production
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        logger.info(`[SocketService] New client connected: ${socket.id}`);

        socket.on("join", (userId) => {
            if (userId) {
                const roomName = String(userId);
                socket.join(roomName);
                logger.info(`[SocketService] Client ${socket.id} joined room: ${roomName}`);

                // Confirm join to client
                socket.emit("joined", { room: roomName });
            }
        });

        socket.on("disconnect", () => {
            logger.info(`[SocketService] Client disconnected: ${socket.id}`);
        });
    });

    return io;
}

/**
 * Send an event to a specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {object} data - Data to send
 */
function emitToUser(userId, event, data) {
    if (io) {
        const roomName = String(userId);
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        const clientCount = clientsInRoom ? clientsInRoom.size : 0;

        io.to(roomName).emit(event, data);
        logger.info(`[SocketService] Emitted '${event}' to user ${roomName} (Active clients in room: ${clientCount})`);
    } else {
        logger.warn("[SocketService] Socket.io not initialized. Cannot emit.");
    }
}

/**
 * Get the Socket.io instance
 */
function getIO() {
    return io;
}

module.exports = {
    initSocket,
    emitToUser,
    getIO
};
