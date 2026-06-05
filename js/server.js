const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 
});

app.use(express.static(path.join(__dirname, '..')));

// Since you are running this locally on your LAN, devices will have different local IPs (192.168.1.x)
// Grouping strictly by IP isolates them. We will put everyone connecting to this server in the same group.
let connectedUsers = {};

function getDeviceIP(socket) {
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (ip.includes(',')) ip = ip.split(',')[0];
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1') ip = '127.0.0.1';
    return ip.trim();
}

io.on('connection', (socket) => {
    const ip = getDeviceIP(socket);
    console.log(`Thiết bị kết nối: ${socket.id} từ IP: ${ip}`);
    
    // Tên mặc định là IP
    const userName = ip;
    
    connectedUsers[socket.id] = { id: socket.id, name: userName, ip: ip };

    // Gửi thông tin cá nhân
    socket.emit('your info', connectedUsers[socket.id]);
    
    // Phát danh sách toàn bộ thiết bị đang kết nối tới server
    io.emit('user list', Object.values(connectedUsers));

    // Đổi tên
    socket.on('change name', (newName) => {
        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].name = newName;
            io.emit('user list', Object.values(connectedUsers));
            socket.emit('your info', connectedUsers[socket.id]);
        }
    });

    // --- WebRTC Signaling ---
    socket.on('webrtc_offer', (data) => {
        io.to(data.target).emit('webrtc_offer', {
            sender: socket.id,
            offer: data.offer
        });
    });

    socket.on('webrtc_answer', (data) => {
        io.to(data.target).emit('webrtc_answer', {
            sender: socket.id,
            answer: data.answer
        });
    });

    socket.on('webrtc_ice_candidate', (data) => {
        io.to(data.target).emit('webrtc_ice_candidate', {
            sender: socket.id,
            candidate: data.candidate
        });
    });

    socket.on('disconnect', () => {
        console.log(`Thiết bị ngắt kết nối: ${socket.id}`);
        if (connectedUsers[socket.id]) {
            delete connectedUsers[socket.id];
            io.emit('user list', Object.values(connectedUsers));
        }
    });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('Máy chủ đang chạy tại http://0.0.0.0:3000');
});