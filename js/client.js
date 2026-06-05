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

// --- Formatters ---
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Socket Events ---
socket.on('your info', (info) => {
    myInfo = info;
    myDisplayName.textContent = info.name;
});

socket.on('user list', (userList) => {
    users = userList;
    updateSidebar();
    updateChatHeader();
});

socket.on('chat message', (msg) => {
    let targetChat = '';
    if (msg.to === 'general') {
        targetChat = 'general';
    } else {
        targetChat = msg.from.id === myInfo.id ? msg.to : msg.from.id;
    }

    if (!chatHistory[targetChat]) {
        chatHistory[targetChat] = [];
    }
    chatHistory[targetChat].push(msg);

    if (currentActiveChat === targetChat) {
        renderMessage(msg);
        scrollToBottom();
    }

    updateSidebar();
});

// --- UI Updates ---
function updateSidebar() {
    const query = userSearchInput.value.toLowerCase();
    
    let html = '';
    // Always show general if it matches search (or search is empty)
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
    
    // Clear search when switching chats
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
        // If we have a search query, check if content matches
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
            <a href="${msg.fileUrl}" target="_blank" class="msg-file">
                <i class="ph-fill ph-file-doc"></i>
                <div class="file-info">
                    <span class="file-name">${msg.fileName}</span>
                    <span class="file-size">Tải xuống</span>
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
        socket.emit('chat message', {
            to: currentActiveChat,
            content: content,
            isFile: false
        });
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

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            socket.emit('chat message', {
                to: currentActiveChat,
                content: '',
                isFile: true,
                fileName: result.fileName,
                fileUrl: result.url
            });
        } else {
            alert('Lỗi khi tải file lên!');
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Lỗi kết nối khi tải file!');
    } finally {
        fileInput.value = '';
        attachBtn.innerHTML = btnIcon;
        attachBtn.disabled = false;
    }
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
