const tutorService = require('../services/tutorService');

module.exports = (io, socket) => {
    socket.on("tutor:ask", async (question) => {
        await tutorService.handleTutorQuestion(socket, question);
    });
};
