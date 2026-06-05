const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Even though we use WebRTC, keep this high just in case of large signaling payloads if any
});

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

// Manage rooms based on Public IP
// rooms[ip] = { socketId: { id, name, ip } }
let rooms = {};

function getPublicIP(socket) {
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (ip.includes(',')) ip = ip.split(',')[0]; // Handle multiple proxies
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1') ip = '127.0.0.1';
    return ip.trim();
}

io.on('connection', (socket) => {
    const ip = getPublicIP(socket);
    console.log(`Thiết bị kết nối: ${socket.id} từ IP: ${ip}`);
    
    // Assign IP as default name (can be changed later)
    const userName = ip;
    
    if (!rooms[ip]) {
        rooms[ip] = {};
    }
    
    rooms[ip][socket.id] = { id: socket.id, name: userName, ip: ip };
    socket.join(ip); // Join the IP-based room

    // Send current user their info
    socket.emit('your info', rooms[ip][socket.id]);
    
    // Broadcast updated user list to everyone in the SAME ROOM
    io.to(ip).emit('user list', Object.values(rooms[ip]));

    // Handle rename
    socket.on('change name', (newName) => {
        if (rooms[ip][socket.id]) {
            rooms[ip][socket.id].name = newName;
            io.to(ip).emit('user list', Object.values(rooms[ip]));
            socket.emit('your info', rooms[ip][socket.id]);
        }
    });

    // --- WebRTC Signaling ---
    
    // 1. Offer
    socket.on('webrtc_offer', (data) => {
        io.to(data.target).emit('webrtc_offer', {
            sender: socket.id,
            offer: data.offer
        });
    });

    // 2. Answer
    socket.on('webrtc_answer', (data) => {
        io.to(data.target).emit('webrtc_answer', {
            sender: socket.id,
            answer: data.answer
        });
    });

    // 3. ICE Candidate
    socket.on('webrtc_ice_candidate', (data) => {
        io.to(data.target).emit('webrtc_ice_candidate', {
            sender: socket.id,
            candidate: data.candidate
        });
    });

    socket.on('disconnect', () => {
        console.log(`Thiết bị ngắt kết nối: ${socket.id}`);
        if (rooms[ip]) {
            delete rooms[ip][socket.id];
            // Broadcast updated list
            io.to(ip).emit('user list', Object.values(rooms[ip]));
            
            // Cleanup empty rooms
            if (Object.keys(rooms[ip]).length === 0) {
                delete rooms[ip];
            }
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('Máy chủ đang chạy tại http://0.0.0.0:3000');
});