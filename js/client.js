const socket = io();

// UI Elements
const chatList = document.getElementById('chat-list');
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const currentChatName = document.getElementById('current-chat-name');
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
const pinnedMessageContainer = document.getElementById('pinned-message-container');

// Profile & Rename UI
const myDisplayName = document.getElementById('my-display-name');
const renameBtn = document.getElementById('rename-btn');
const renameModal = document.getElementById('rename-modal');
const cancelRenameBtn = document.getElementById('cancel-rename-btn');
const saveRenameBtn = document.getElementById('save-rename-btn');
const newNameInput = document.getElementById('new-name-input');

// Search UI
const userSearchInput = document.getElementById('user-search-input');
const messageSearchContainer = document.getElementById('message-search-container');
const toggleMsgSearchBtn = document.getElementById('toggle-msg-search-btn');
const closeMsgSearchBtn = document.getElementById('close-msg-search-btn');
const messageSearchInput = document.getElementById('message-search-input');

// State
let myInfo = null;
let users = [];
let currentActiveChat = 'general'; // 'general' or socket.id
let chatHistory = {
    'general': [] // { from, content, isFile, fileName, fileUrl, timestamp }
};
let msgSearchQuery = '';

// --- WebRTC State ---
const peerConnections = {}; // targetId -> RTCPeerConnection
const dataChannels = {};    // targetId -> RTCDataChannel
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- Formatters ---
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

// --- Socket Events (Signaling) ---
socket.on('your info', (info) => {
    myInfo = info;
    myDisplayName.textContent = info.name;
});

socket.on('user list', (userList) => {
    users = userList;
    updateSidebar();
    updateChatHeader();
    
    // WebRTC: Connect to new users
    if (myInfo) {
        users.forEach(user => {
            if (user.id !== myInfo.id && !peerConnections[user.id]) {
                // To avoid glare (both sides creating offer), only the one with 'larger' ID creates the offer
                if (myInfo.id > user.id) {
                    createPeerConnection(user.id, true);
                } else {
                    createPeerConnection(user.id, false);
                }
            }
        });
    }
});

// 1. Receive Offer
socket.on('webrtc_offer', async (data) => {
    const pc = peerConnections[data.sender];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', { target: data.sender, answer: answer });
    }
});

// 2. Receive Answer
socket.on('webrtc_answer', async (data) => {
    const pc = peerConnections[data.sender];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

// 3. Receive ICE Candidate
socket.on('webrtc_ice_candidate', async (data) => {
    const pc = peerConnections[data.sender];
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    }
});

// --- WebRTC Setup ---
function createPeerConnection(targetId, isInitiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[targetId] = pc;

    // Send ICE candidates to the other peer
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc_ice_candidate', {
                target: targetId,
                candidate: event.candidate
            });
        }
    };

    if (isInitiator) {
        // Create Data Channel
        const dc = pc.createDataChannel('chat');
        setupDataChannel(dc, targetId);

        // Create Offer
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
        }).then(() => {
            socket.emit('webrtc_offer', {
                target: targetId,
                offer: pc.localDescription
            });
        }).catch(e => console.error("Create offer error", e));
    } else {
        // Wait for Data Channel from the other side
        pc.ondatachannel = (event) => {
            setupDataChannel(event.channel, targetId);
        };
    }
}

// File receiving state
let receivingFiles = {}; // fileId -> { chunks: [], name: '', size: 0, received: 0 }

function setupDataChannel(dc, targetId) {
    dataChannels[targetId] = dc;
    
    dc.onopen = () => console.log(`DataChannel opened with ${targetId}`);
    dc.onclose = () => {
        console.log(`DataChannel closed with ${targetId}`);
        delete dataChannels[targetId];
        delete peerConnections[targetId];
    };
    
    dc.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const senderInfo = users.find(u => u.id === targetId);
        if (!senderInfo) return;

        if (data.type === 'text') {
            handleIncomingMessage({
                from: senderInfo,
                to: data.to,
                content: data.content,
                isFile: false,
                timestamp: data.timestamp
            });
        } 
        else if (data.type === 'file-start') {
            receivingFiles[data.fileId] = {
                name: data.fileName,
                size: data.size,
                chunks: [],
                received: 0,
                to: data.to,
                timestamp: data.timestamp
            };
        }
        else if (data.type === 'file-chunk') {
            const fileData = receivingFiles[data.fileId];
            if (fileData) {
                fileData.chunks.push(data.chunk);
                fileData.received += data.chunk.length;
            }
        }
        else if (data.type === 'file-end') {
            const fileData = receivingFiles[data.fileId];
            if (fileData) {
                try {
                    // Assemble base64 chunks
                    const base64Data = fileData.chunks.join('');
                    
                    // Natively convert base64 to Blob using Fetch API (very efficient)
                    const response = await fetch(`data:application/octet-stream;base64,${base64Data}`);
                    const blob = await response.blob();
                    
                    // Create local URL
                    const fileUrl = URL.createObjectURL(blob);
                    
                    handleIncomingMessage({
                        from: senderInfo,
                        to: fileData.to,
                        content: '',
                        isFile: true,
                        fileName: fileData.name,
                        fileUrl: fileUrl,
                        timestamp: fileData.timestamp
                    });
                } catch (e) {
                    console.error("Lỗi khi giải nén file:", e);
                } finally {
                    delete receivingFiles[data.fileId];
                }
            }
        }
    };
}

function handleIncomingMessage(msg) {
    let targetChat = msg.to === 'general' ? 'general' : msg.from.id;

    if (!chatHistory[targetChat]) {
        chatHistory[targetChat] = [];
    }
    chatHistory[targetChat].push(msg);

    if (currentActiveChat === targetChat) {
        renderMessage(msg);
        scrollToBottom();
    }
    updateSidebar();
}

function sendViaWebRTC(payload) {
    const payloadStr = JSON.stringify(payload);
    
    if (payload.to === 'general') {
        // Send to everyone
        Object.values(dataChannels).forEach(dc => {
            if (dc.readyState === 'open') {
                dc.send(payloadStr);
            }
        });
    } else {
        // Direct message
        const dc = dataChannels[payload.to];
        if (dc && dc.readyState === 'open') {
            dc.send(payloadStr);
        }
    }
}

// --- File Sending Logic (Chunking) ---
async function sendFile(file, toChat) {
    const fileId = generateId();
    const timestamp = new Date().toISOString();
    
    // 1. Notify start
    sendViaWebRTC({
        type: 'file-start',
        fileId: fileId,
        fileName: file.name,
        size: file.size,
        to: toChat,
        timestamp: timestamp
    });

    const reader = new FileReader();
    reader.onload = async (e) => {
        // Lấy chuỗi base64 của toàn bộ file
        const base64String = e.target.result.split(',')[1];
        
        // 2. Cắt chuỗi base64 thành các mảnh nhỏ và gửi
        const chunkSize = 16384; // 16KB
        for (let i = 0; i < base64String.length; i += chunkSize) {
            const chunk = base64String.slice(i, i + chunkSize);
            sendViaWebRTC({
                type: 'file-chunk',
                fileId: fileId,
                chunk: chunk
            });
            
            // Chống đầy bộ nhớ đệm (buffer overflow) của WebRTC với file lớn
            if (i % (chunkSize * 20) === 0) {
                await new Promise(r => setTimeout(r, 5)); 
            }
        }
        
        // 3. Notify end
        sendViaWebRTC({
            type: 'file-end',
            fileId: fileId
        });
        
        // Thêm vào giao diện máy gửi
        const fileUrl = URL.createObjectURL(file);
        const msg = {
            from: myInfo,
            to: toChat,
            content: '',
            isFile: true,
            fileName: file.name,
            fileUrl: fileUrl,
            timestamp: timestamp
        };
        if (!chatHistory[toChat]) chatHistory[toChat] = [];
        chatHistory[toChat].push(msg);
        
        if (currentActiveChat === toChat) {
            renderMessage(msg);
            scrollToBottom();
        }
        updateSidebar();
    };
    
    // Đọc toàn bộ file thành chuỗi DataURL (Base64)
    reader.readAsDataURL(file);
}


// --- UI Updates ---
function updateSidebar() {
    const query = userSearchInput.value.toLowerCase();
    let html = '';
    
    if ("nhóm chung nội bộ".includes(query) || query === "") {
        html += `
            <div class="chat-item ${currentActiveChat === 'general' ? 'active' : ''}" data-id="general" id="chat-general" onclick="switchChat('general')">
                <div class="avatar group-avatar">
                    <i class="ph-fill ph-users-three"></i>
                </div>
                <div class="chat-info">
                    <div class="chat-name-row">
                        <span class="chat-name">Nhóm chung nội bộ</span>
                        <span class="chat-time">${getLastMessageTime('general')}</span>
                    </div>
                    <div class="chat-last-msg-row">
                        <span class="chat-last-msg">${getLastMessagePreview('general')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    users.forEach(user => {
        if (myInfo && user.id === myInfo.id) return;
        
        if (user.name.toLowerCase().includes(query) || query === "") {
            html += `
                <div class="chat-item ${currentActiveChat === user.id ? 'active' : ''}" data-id="${user.id}" onclick="switchChat('${user.id}')">
                    <div class="avatar">
                        <i class="ph-fill ph-user"></i>
                    </div>
                    <div class="chat-info">
                        <div class="chat-name-row">
                            <span class="chat-name">${user.name}</span>
                            <span class="chat-time">${getLastMessageTime(user.id)}</span>
                        </div>
                        <div class="chat-last-msg-row">
                            <span class="chat-last-msg">${getLastMessagePreview(user.id)}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    chatList.innerHTML = html;
}

function updateChatHeader() {
    if (currentActiveChat === 'general') {
        currentChatName.textContent = 'Nhóm chung nội bộ';
        document.getElementById('current-chat-avatar').innerHTML = `<i class="ph-fill ph-users-three"></i>`;
        pinnedMessageContainer.style.display = 'flex';
    } else {
        const user = users.find(u => u.id === currentActiveChat);
        if (user) {
            currentChatName.textContent = user.name;
            document.getElementById('current-chat-avatar').innerHTML = `<i class="ph-fill ph-user"></i>`;
            pinnedMessageContainer.style.display = 'none';
        }
    }
}

function getLastMessage(chatId) {
    const history = chatHistory[chatId];
    if (history && history.length > 0) {
        return history[history.length - 1];
    }
    return null;
}

function getLastMessageTime(chatId) {
    const msg = getLastMessage(chatId);
    return msg ? formatTime(msg.timestamp) : '';
}

function getLastMessagePreview(chatId) {
    const msg = getLastMessage(chatId);
    if (!msg) {
        return chatId === 'general' ? 'Chưa có tin nhắn nào' : 'Bắt đầu trò chuyện';
    }
    const prefix = msg.from.id === myInfo?.id ? 'Bạn: ' : '';
    if (msg.isFile) {
        return `${prefix}[File] ${msg.fileName}`;
    }
    return `${prefix}${msg.content}`;
}

window.switchChat = function(chatId) {
    currentActiveChat = chatId;
    
    msgSearchQuery = '';
    messageSearchInput.value = '';
    messageSearchContainer.style.display = 'none';
    toggleMsgSearchBtn.style.display = 'block';
    
    updateSidebar();
    updateChatHeader();
    renderChatHistory();
}

function renderChatHistory() {
    messagesContainer.innerHTML = '<div class="date-divider"><span>Hôm nay</span></div>';
    
    const history = chatHistory[currentActiveChat] || [];
    history.forEach(msg => {
        if (msgSearchQuery && !msg.isFile) {
            if (msg.content.toLowerCase().includes(msgSearchQuery)) {
                renderMessage(msg, true);
            }
        } else if (!msgSearchQuery) {
            renderMessage(msg, false);
        }
    });
    scrollToBottom();
}

function renderMessage(msg, isHighlighted = false) {
    const isMine = myInfo && msg.from.id === myInfo.id;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMine ? 'mine' : ''}`;

    let contentHtml = '';
    if (msg.isFile) {
        contentHtml = `
            <a href="${msg.fileUrl}" target="_blank" download="${msg.fileName}" class="msg-file">
                <i class="ph-fill ph-file-doc"></i>
                <div class="file-info">
                    <span class="file-name">${msg.fileName}</span>
                    <span class="file-size">Tải xuống (Lưu cục bộ)</span>
                </div>
            </a>
        `;
    } else {
        contentHtml = msg.content;
    }

    msgDiv.innerHTML = `
        <div class="avatar">
            <i class="ph-fill ph-user"></i>
        </div>
        <div class="msg-content-wrapper">
            <span class="msg-sender">${msg.from.name}</span>
            <div class="msg-bubble ${isHighlighted ? 'highlighted' : ''}">
                ${contentHtml}
                <span class="msg-time">${formatTime(msg.timestamp)}</span>
            </div>
        </div>
    `;

    messagesContainer.appendChild(msgDiv);
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Interactions ---
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = messageInput.value.trim();
    if (content) {
        const timestamp = new Date().toISOString();
        const payload = {
            type: 'text',
            to: currentActiveChat,
            content: content,
            timestamp: timestamp
        };
        
        // Send via P2P
        sendViaWebRTC(payload);

        // Add to own history
        const msg = {
            from: myInfo,
            to: currentActiveChat,
            content: content,
            isFile: false,
            timestamp: timestamp
        };
        if (!chatHistory[currentActiveChat]) chatHistory[currentActiveChat] = [];
        chatHistory[currentActiveChat].push(msg);
        
        renderMessage(msg);
        scrollToBottom();
        updateSidebar();
        
        messageInput.value = '';
    }
});

// File Upload
attachBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const btnIcon = attachBtn.innerHTML;
    attachBtn.innerHTML = '<div class="spinner"></div>';
    attachBtn.disabled = true;

    // Send the file over P2P DataChannels
    await sendFile(file, currentActiveChat);
    
    fileInput.value = '';
    attachBtn.innerHTML = btnIcon;
    attachBtn.disabled = false;
});

// Rename logic
renameBtn.addEventListener('click', () => {
    newNameInput.value = myInfo?.name || '';
    renameModal.classList.add('active');
    newNameInput.focus();
});
cancelRenameBtn.addEventListener('click', () => {
    renameModal.classList.remove('active');
});
saveRenameBtn.addEventListener('click', () => {
    const newName = newNameInput.value.trim();
    if (newName && newName !== myInfo?.name) {
        socket.emit('change name', newName);
    }
    renameModal.classList.remove('active');
});

// User Search logic
userSearchInput.addEventListener('input', () => {
    updateSidebar();
});

// Message Search logic
toggleMsgSearchBtn.addEventListener('click', () => {
    toggleMsgSearchBtn.style.display = 'none';
    messageSearchContainer.style.display = 'flex';
    messageSearchInput.focus();
});
closeMsgSearchBtn.addEventListener('click', () => {
    messageSearchContainer.style.display = 'none';
    toggleMsgSearchBtn.style.display = 'block';
    messageSearchInput.value = '';
    msgSearchQuery = '';
    renderChatHistory();
});
messageSearchInput.addEventListener('input', (e) => {
    msgSearchQuery = e.target.value.toLowerCase();
    renderChatHistory();
});
