// ------------------------------ Back-end logic for the collaborative whiteboard ------------------------------


// ---------------------------------------
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
// ---------------------------------------

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for room states
const rooms = new Map();

function getRoomState(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            strokes: [],
            texts: []
        });
    }
    return rooms.get(roomId);
}

// Socket.IO connection handling - multi-user connection
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    let currentRoom = null;

    // Join a room
    socket.on('join-room', (roomId) => {
        // Leave a previous room if needed
        if (currentRoom) {
            socket.leave(currentRoom);
        }
        
        currentRoom = roomId;
        socket.join(roomId);
        
        // Send current room state to the new user - ensures peoples just joining can view previously made changes to the whiteboard
        const roomState = getRoomState(roomId);
        socket.emit('room-state', roomState);
        
        // Notify others in the room
        socket.to(roomId).emit('user-joined', socket.id);
        
        console.log(`User ${socket.id} joined room: ${roomId}`);
    });

    // Drawing strokes
    socket.on('draw-stroke', (stroke) => {
        if (!currentRoom) return;
        
        const roomState = getRoomState(currentRoom);
        roomState.strokes.push(stroke);
        
        // Broadcast strokes to all users in the room
        socket.to(currentRoom).emit('stroke-drawn', stroke);
    });

    // Live drawing - handle strokes while the user is still drawing
    socket.on('drawing', (data) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('drawing', data);
    });

    // Text boxes
    socket.on('add-text', (textObj) => {
        if (!currentRoom) return;
        
        const roomState = getRoomState(currentRoom);
        roomState.texts.push(textObj);
        
        // Broadcast text to all other users in the room
        socket.to(currentRoom).emit('text-added', textObj);
    });

    // Clear board feature
    socket.on('clear-board', () => {
        if (!currentRoom) return;
        
        const roomState = getRoomState(currentRoom);
        roomState.strokes = [];
        roomState.texts = [];
        
        // Broadcast to all users in the room - including sender via io.to
        io.to(currentRoom).emit('board-cleared');
    });

    // Handle disconnection issues
    socket.on('disconnect', () => {
        if (currentRoom) {
            socket.to(currentRoom).emit('user-left', socket.id);
        }
        console.log('User disconnected:', socket.id);
    });
});

// Catch-all route to serve the app for any room URL - ensures the front-end loads for any room and handles 404 errors
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the HTTP + Socket.IO server on the specified PORT
server.listen(PORT, () => {
    console.log(`Collaborative Whiteboard server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/room/my-board to create or join a room`);
});
