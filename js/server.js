const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // 100 MB max for socket transfers
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(uploadsDir));

let connectedUsers = {};

io.on('connection', (socket) => {
    console.log(`Thiết bị kết nối: ${socket.id}`);
    
    // Get IP Address
    let ip = socket.handshake.address;
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    if (ip === '::1') ip = '127.0.0.1';

    // Assign IP as default name
    const userName = ip;
    connectedUsers[socket.id] = { id: socket.id, name: userName };

    // Send current user their info
    socket.emit('your info', connectedUsers[socket.id]);
    
    // Broadcast updated user list to everyone
    io.emit('user list', Object.values(connectedUsers));

    // Handle rename
    socket.on('change name', (newName) => {
        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].name = newName;
            io.emit('user list', Object.values(connectedUsers));
            socket.emit('your info', connectedUsers[socket.id]);
        }
    });

    // Handle incoming messages
    socket.on('chat message', (data) => {
        const { to, content, isFile, fileName, fileUrl } = data;
        const senderInfo = connectedUsers[socket.id];

        const messageData = {
            from: senderInfo,
            content: content,
            isFile: isFile,
            fileName: fileName,
            fileUrl: fileUrl,
            timestamp: new Date().toISOString()
        };

        if (to === 'general') {
            // Broadcast to everyone
            io.emit('chat message', { ...messageData, to: 'general' });
        } else {
            // Direct message
            if (connectedUsers[to]) {
                io.to(to).emit('chat message', { ...messageData, to: socket.id }); // send to recipient
                socket.emit('chat message', { ...messageData, to: to }); // echo back to sender
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Thiết bị ngắt kết nối: ${socket.id}`);
        delete connectedUsers[socket.id];
        io.emit('user list', Object.values(connectedUsers));
    });
});

// Endpoint for file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    // Return the URL to access the file
    res.json({ url: `/uploads/${req.file.filename}`, fileName: req.file.originalname, size: req.file.size });
});

server.listen(3000, '0.0.0.0', () => {
    console.log('Máy chủ đang chạy tại http://0.0.0.0:3000');
});