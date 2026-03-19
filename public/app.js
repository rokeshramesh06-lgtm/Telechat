// ─── STATE ───
let currentUser = null;
let socket = null;
let conversations = [];
let activeConversation = null;
let typingTimeout = null;

// Call state
let currentCall = null;
let peerConnection = null;
let localStream = null;
let callTimerInterval = null;
let callStartTime = null;

// ─── DOM ELEMENTS ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const authScreen = $('#auth-screen');
const chatScreen = $('#chat-screen');
const loginForm = $('#login-form');
const signupForm = $('#signup-form');

// ─── AUTH ───
$('#show-signup').addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.style.display = 'none';
  signupForm.style.display = 'block';
});

$('#show-login').addEventListener('click', (e) => {
  e.preventDefault();
  signupForm.style.display = 'none';
  loginForm.style.display = 'block';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loginUser(data);
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const displayName = $('#signup-display').value.trim();
  const username = $('#signup-username').value.trim();
  const password = $('#signup-password').value;
  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    loginUser(data);
  } catch (err) {
    $('#signup-error').textContent = err.message;
  }
});

function loginUser(user) {
  currentUser = user;
  localStorage.setItem('telechat_user', JSON.stringify(user));
  authScreen.classList.remove('active');
  chatScreen.classList.add('active');
  initSocket();
  loadConversations();
  updateMenuInfo();
}

function logout() {
  if (socket) socket.disconnect();
  currentUser = null;
  activeConversation = null;
  localStorage.removeItem('telechat_user');
  chatScreen.classList.remove('active');
  authScreen.classList.add('active');
  loginForm.style.display = 'block';
  signupForm.style.display = 'none';
  $('#login-username').value = '';
  $('#login-password').value = '';
  $('#login-error').textContent = '';
}

// Auto-login
const saved = localStorage.getItem('telechat_user');
if (saved) {
  try { loginUser(JSON.parse(saved)); } catch (e) { localStorage.removeItem('telechat_user'); }
}

// ─── SOCKET ───
function initSocket() {
  socket = io();
  socket.emit('user:online', currentUser.id);

  socket.on('message:received', (msg) => {
    // Add to active chat if matching
    if (activeConversation && msg.conversation_id === activeConversation.id) {
      appendMessage(msg);
      scrollToBottom();
      // Mark as read
      if (msg.sender_id !== currentUser.id) {
        socket.emit('message:read', { conversationId: activeConversation.id, userId: currentUser.id });
      }
    }
    loadConversations();
  });

  socket.on('message:read', ({ conversationId }) => {
    // Could update read receipts UI here
  });

  socket.on('user:status', ({ userId, status }) => {
    // Update status in sidebar
    document.querySelectorAll(`[data-user-id="${userId}"]`).forEach((el) => {
      const dot = el.querySelector('.online-dot');
      if (status === 'online') {
        if (!dot) {
          const d = document.createElement('div');
          d.className = 'online-dot';
          el.querySelector('.avatar')?.appendChild(d);
        }
      } else {
        dot?.remove();
      }
    });
    // Update chat header status
    if (activeConversation) {
      const other = getOtherUser(activeConversation);
      if (other && other.id === userId) {
        const statusEl = $('#chat-status');
        statusEl.textContent = status === 'online' ? 'online' : 'offline';
        statusEl.className = 'chat-status' + (status === 'online' ? ' online' : '');
      }
    }
  });

  socket.on('typing:start', ({ conversationId, userName }) => {
    if (activeConversation && conversationId === activeConversation.id) {
      $('#typing-name').textContent = userName;
      $('#typing-indicator').style.display = 'block';
    }
  });

  socket.on('typing:stop', ({ conversationId }) => {
    if (activeConversation && conversationId === activeConversation.id) {
      $('#typing-indicator').style.display = 'none';
    }
  });

  // ─── CALL SOCKET EVENTS ───
  socket.on('call:incoming', ({ callId, callerId, callerName, conversationId, callType }) => {
    currentCall = { callId, callerId, callerName, conversationId, callType, role: 'callee' };
    showIncomingCall(callerName, callType);
  });

  socket.on('call:initiated', ({ callId }) => {
    if (currentCall) currentCall.callId = callId;
  });

  socket.on('call:accepted', async ({ callId, calleeId }) => {
    $('#call-status-text').textContent = 'Connecting...';
    await startWebRTC(true, calleeId);
  });

  socket.on('call:rejected', ({ callId }) => {
    $('#call-status-text').textContent = 'Call declined';
    setTimeout(endCallUI, 1500);
  });

  socket.on('call:unavailable', ({ reason }) => {
    $('#call-status-text').textContent = reason;
    setTimeout(endCallUI, 1500);
  });

  socket.on('call:ended', () => {
    endCallUI();
  });

  socket.on('webrtc:offer', async ({ offer, callId, fromUserId }) => {
    await handleWebRTCOffer(offer, fromUserId);
  });

  socket.on('webrtc:answer', async ({ answer }) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  socket.on('webrtc:ice-candidate', async ({ candidate }) => {
    if (peerConnection && candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) { /* ignore */ }
    }
  });
}

// ─── CONVERSATIONS ───
async function loadConversations() {
  if (!currentUser) return;
  const res = await fetch(`/api/conversations/${currentUser.id}`);
  conversations = await res.json();
  renderConversations();
}

function renderConversations() {
  const list = $('#conversations-list');
  list.innerHTML = '';

  if (conversations.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No conversations yet.<br>Search for users to start chatting!</div>';
    return;
  }

  conversations.forEach((conv) => {
    const other = getOtherUser(conv);
    if (!other) return;
    const el = document.createElement('div');
    el.className = 'conversation-item' + (activeConversation?.id === conv.id ? ' active' : '');
    el.setAttribute('data-user-id', other.id);

    const time = conv.last_message_time ? formatTime(conv.last_message_time) : '';
    const lastMsg = conv.last_message || 'No messages yet';
    const unread = conv.unread_count > 0 ? `<div class="unread-badge">${conv.unread_count}</div>` : '';

    el.innerHTML = `
      <div class="avatar" style="background:${other.avatar_color}">
        ${other.display_name.charAt(0).toUpperCase()}
        ${other.status === 'online' ? '<div class="online-dot"></div>' : ''}
      </div>
      <div class="conv-info">
        <div class="conv-name">${escapeHtml(other.display_name)}</div>
        <div class="conv-last-msg">${escapeHtml(lastMsg)}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${time}</span>
        ${unread}
      </div>
    `;

    el.addEventListener('click', () => openConversation(conv));
    list.appendChild(el);
  });
}

function getOtherUser(conv) {
  if (!conv.members) return null;
  return conv.members.find((m) => m.id !== currentUser.id) || conv.members[0];
}

async function openConversation(conv) {
  activeConversation = conv;
  const other = getOtherUser(conv);
  if (!other) return;

  // Update UI
  $('#empty-state').style.display = 'none';
  $('#chat-header').style.display = 'flex';
  $('#messages-container').style.display = 'flex';
  $('#message-input-area').style.display = 'block';

  // Chat header
  $('#chat-avatar').style.background = other.avatar_color;
  $('#chat-avatar').textContent = other.display_name.charAt(0).toUpperCase();
  const dot = $('#chat-avatar').querySelector('.online-dot');
  if (other.status === 'online' && !dot) {
    const d = document.createElement('div');
    d.className = 'online-dot';
    $('#chat-avatar').appendChild(d);
  } else if (other.status !== 'online' && dot) {
    dot.remove();
  }
  $('#chat-name').textContent = other.display_name;
  $('#chat-status').textContent = other.status === 'online' ? 'online' : 'offline';
  $('#chat-status').className = 'chat-status' + (other.status === 'online' ? ' online' : '');

  // Mobile
  chatScreen.classList.add('chat-open');

  // Load messages
  const res = await fetch(`/api/messages/${conv.id}`);
  const messages = await res.json();
  renderMessages(messages);
  scrollToBottom();

  // Mark as read
  socket.emit('message:read', { conversationId: conv.id, userId: currentUser.id });

  // Update sidebar active state
  renderConversations();

  // Focus input
  $('#message-input').focus();
}

function renderMessages(messages) {
  const list = $('#messages-list');
  list.innerHTML = '';

  let lastDate = '';
  messages.forEach((msg) => {
    const msgDate = new Date(msg.created_at).toLocaleDateString();
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      const divider = document.createElement('div');
      divider.className = 'message-date-divider';
      divider.innerHTML = `<span>${formatDate(msg.created_at)}</span>`;
      list.appendChild(divider);
    }
    appendMessage(msg, list);
  });
}

function appendMessage(msg, container) {
  const list = container || $('#messages-list');
  const isOutgoing = msg.sender_id === currentUser.id;
  const el = document.createElement('div');
  el.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;

  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <div class="message-bubble">
      ${!isOutgoing ? `<div class="message-sender" style="color:${msg.sender_color}">${escapeHtml(msg.sender_name)}</div>` : ''}
      <div class="message-text">${escapeHtml(msg.content)}</div>
      <div class="message-time">${time}</div>
    </div>
  `;
  list.appendChild(el);
}

function scrollToBottom() {
  const container = $('#messages-container');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

// ─── SEND MESSAGE ───
$('#message-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

$('#send-btn').addEventListener('click', sendMessage);

function sendMessage() {
  const input = $('#message-input');
  const content = input.value.trim();
  if (!content || !activeConversation) return;

  socket.emit('message:send', {
    conversationId: activeConversation.id,
    senderId: currentUser.id,
    content,
    type: 'text',
  });

  input.value = '';
  input.style.height = 'auto';
  socket.emit('typing:stop', { conversationId: activeConversation.id, userId: currentUser.id });
}

// ─── TYPING INDICATOR ───
$('#message-input').addEventListener('input', () => {
  if (!activeConversation) return;
  if (!typingTimeout) {
    socket.emit('typing:start', {
      conversationId: activeConversation.id,
      userId: currentUser.id,
      userName: currentUser.displayName,
    });
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', { conversationId: activeConversation.id, userId: currentUser.id });
    typingTimeout = null;
  }, 2000);

  // Auto-resize textarea
  const ta = $('#message-input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
});

// ─── SEARCH ───
let searchTimeout = null;
$('#search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (!q) {
    $('#search-results').style.display = 'none';
    return;
  }
  searchTimeout = setTimeout(async () => {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&exclude=${currentUser.id}`);
    const users = await res.json();
    renderSearchResults(users);
  }, 300);
});

function renderSearchResults(users) {
  const container = $('#search-results');
  container.innerHTML = '';
  if (users.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary)">No users found</div>';
  }
  users.forEach((user) => {
    const el = document.createElement('div');
    el.className = 'search-result-item';
    el.innerHTML = `
      <div class="avatar small" style="background:${user.avatar_color}">
        ${user.display_name.charAt(0).toUpperCase()}
        ${user.status === 'online' ? '<div class="online-dot"></div>' : ''}
      </div>
      <div>
        <div style="font-weight:500">${escapeHtml(user.display_name)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">@${escapeHtml(user.username)}</div>
      </div>
    `;
    el.addEventListener('click', () => startConversation(user));
    container.appendChild(el);
  });
  container.style.display = 'block';
}

async function startConversation(otherUser) {
  $('#search-input').value = '';
  $('#search-results').style.display = 'none';

  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, otherUserId: otherUser.id }),
  });
  const conv = await res.json();
  await loadConversations();
  openConversation(conv);
}

// ─── SIDEBAR TABS ───
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('#conversations-list').style.display = tab === 'chats' ? 'block' : 'none';
    $('#calls-list').style.display = tab === 'calls' ? 'block' : 'none';
    if (tab === 'calls') loadCallHistory();
  });
});

// ─── CALL HISTORY ───
async function loadCallHistory() {
  if (!currentUser) return;
  const res = await fetch(`/api/calls/${currentUser.id}`);
  const calls = await res.json();
  renderCallHistory(calls);
}

function renderCallHistory(calls) {
  const list = $('#calls-list');
  list.innerHTML = '';

  if (calls.length === 0) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary)">No call history</div>';
    return;
  }

  calls.forEach((call) => {
    const isCaller = call.caller_id === currentUser.id;
    const otherName = isCaller ? call.callee_name : call.caller_name;
    const otherColor = isCaller ? call.callee_color : call.caller_color;
    const isMissed = call.status === 'missed' || call.status === 'rejected';
    const arrow = isCaller ? '↗' : '↙';
    const statusClass = isMissed ? 'missed' : 'incoming';
    const statusText = isMissed ? 'Missed' : (call.status === 'ended' ? formatDuration(call.duration) : call.status);
    const typeIcon = call.type === 'video' ? '📹' : '📞';

    const el = document.createElement('div');
    el.className = 'call-item';
    el.innerHTML = `
      <div class="avatar" style="background:${otherColor}">${otherName.charAt(0).toUpperCase()}</div>
      <div class="call-info">
        <div class="call-info-name">${escapeHtml(otherName)}</div>
        <div class="call-info-detail">
          <span class="${statusClass}">${arrow}</span>
          <span>${typeIcon} ${statusText}</span>
        </div>
      </div>
      <span class="call-info-time">${formatTime(call.started_at)}</span>
    `;
    list.appendChild(el);
  });
}

// ─── MENU ───
$('#menu-btn').addEventListener('click', () => {
  const menu = $('#sidebar-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
});

$('#logout-btn').addEventListener('click', logout);

document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu-btn') && !e.target.closest('#sidebar-menu')) {
    $('#sidebar-menu').style.display = 'none';
  }
  if (!e.target.closest('.search-bar') && !e.target.closest('#search-results')) {
    $('#search-results').style.display = 'none';
  }
});

function updateMenuInfo() {
  if (!currentUser) return;
  const avatar = $('#menu-avatar');
  avatar.style.background = currentUser.avatarColor;
  avatar.textContent = currentUser.displayName.charAt(0).toUpperCase();
  $('#menu-display-name').textContent = currentUser.displayName;
  $('#menu-username').textContent = '@' + currentUser.username;
}

// ─── BACK BUTTON (MOBILE) ───
$('#back-btn').addEventListener('click', () => {
  chatScreen.classList.remove('chat-open');
  activeConversation = null;
});

// ─── CALLS ───
$('#voice-call-btn').addEventListener('click', () => initiateCall('voice'));
$('#video-call-btn').addEventListener('click', () => initiateCall('video'));

function initiateCall(callType) {
  if (!activeConversation || currentCall) return;
  const other = getOtherUser(activeConversation);
  if (!other) return;

  currentCall = {
    callerId: currentUser.id,
    calleeId: other.id,
    callerName: currentUser.displayName,
    conversationId: activeConversation.id,
    callType,
    role: 'caller',
  };

  socket.emit('call:initiate', {
    callerId: currentUser.id,
    calleeId: other.id,
    callerName: currentUser.displayName,
    conversationId: activeConversation.id,
    callType,
  });

  showCallScreen(other.display_name, other.avatar_color, callType);
}

function showCallScreen(name, color, callType) {
  const screen = $('#call-screen');
  const avatar = $('#call-avatar');
  avatar.style.background = color || '#0088cc';
  avatar.textContent = name.charAt(0).toUpperCase();
  $('#call-user-name').textContent = name;
  $('#call-status-text').textContent = 'Calling...';
  $('#call-status-text').style.display = 'block';
  $('#call-timer').style.display = 'none';
  screen.style.display = 'flex';
}

function showIncomingCall(callerName, callType) {
  const screen = $('#incoming-call');
  const avatar = $('#incoming-call-avatar');
  avatar.style.background = '#0088cc';
  avatar.textContent = callerName.charAt(0).toUpperCase();
  $('#incoming-call-name').textContent = callerName;
  $('#incoming-call-type').textContent = `Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`;
  screen.style.display = 'flex';
}

$('#accept-call-btn').addEventListener('click', async () => {
  if (!currentCall) return;
  $('#incoming-call').style.display = 'none';

  socket.emit('call:accept', {
    callId: currentCall.callId,
    calleeId: currentUser.id,
    callerId: currentCall.callerId,
  });

  showCallScreen(currentCall.callerName, '#0088cc', currentCall.callType);
  $('#call-status-text').textContent = 'Connecting...';
});

$('#decline-call-btn').addEventListener('click', () => {
  if (!currentCall) return;
  socket.emit('call:reject', {
    callId: currentCall.callId,
    callerId: currentCall.callerId,
    calleeId: currentUser.id,
  });
  $('#incoming-call').style.display = 'none';
  currentCall = null;
});

$('#call-end-btn').addEventListener('click', () => {
  if (!currentCall) return;
  const otherUserId = currentCall.role === 'caller' ? currentCall.calleeId : currentCall.callerId;
  socket.emit('call:end', {
    callId: currentCall.callId,
    userId: currentUser.id,
    otherUserId,
  });
  endCallUI();
});

$('#call-mute-btn').addEventListener('click', function () {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.classList.toggle('active', !audioTrack.enabled);
    }
  }
});

$('#call-video-toggle-btn').addEventListener('click', function () {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.classList.toggle('active', !videoTrack.enabled);
      $('#local-video').style.display = videoTrack.enabled ? 'block' : 'none';
    }
  }
});

// ─── WEBRTC ───
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

async function startWebRTC(isCaller, targetUserId) {
  try {
    const isVideo = currentCall?.callType === 'video';
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo,
    });

    if (isVideo) {
      $('#local-video').srcObject = localStream;
      $('#local-video').style.display = 'block';
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc:ice-candidate', {
          targetUserId,
          candidate: e.candidate,
          callId: currentCall?.callId,
        });
      }
    };

    peerConnection.ontrack = (e) => {
      if (isVideo) {
        $('#remote-video').srcObject = e.streams[0];
        $('#remote-video-container').style.display = 'block';
      } else {
        // Audio only — create an audio element
        const audio = document.createElement('audio');
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.id = 'remote-audio';
        document.body.appendChild(audio);
      }
      startCallTimer();
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        $('#call-status-text').style.display = 'none';
        $('#call-timer').style.display = 'block';
      }
    };

    if (isCaller) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('webrtc:offer', {
        targetUserId,
        offer,
        callId: currentCall?.callId,
      });
    }
  } catch (err) {
    console.error('WebRTC error:', err);
    $('#call-status-text').textContent = 'Could not access media devices';
    setTimeout(endCallUI, 2000);
  }
}

async function handleWebRTCOffer(offer, fromUserId) {
  const isVideo = currentCall?.callType === 'video';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo,
    });

    if (isVideo) {
      $('#local-video').srcObject = localStream;
      $('#local-video').style.display = 'block';
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc:ice-candidate', {
          targetUserId: fromUserId,
          candidate: e.candidate,
          callId: currentCall?.callId,
        });
      }
    };

    peerConnection.ontrack = (e) => {
      if (isVideo) {
        $('#remote-video').srcObject = e.streams[0];
        $('#remote-video-container').style.display = 'block';
      } else {
        const audio = document.createElement('audio');
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.id = 'remote-audio';
        document.body.appendChild(audio);
      }
      startCallTimer();
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        $('#call-status-text').style.display = 'none';
        $('#call-timer').style.display = 'block';
      }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('webrtc:answer', {
      targetUserId: fromUserId,
      answer,
      callId: currentCall?.callId,
    });
  } catch (err) {
    console.error('WebRTC answer error:', err);
  }
}

function startCallTimer() {
  callStartTime = Date.now();
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    $('#call-timer').textContent = `${mins}:${secs}`;
  }, 1000);
}

function endCallUI() {
  // Clean up WebRTC
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }

  // Remove remote audio if exists
  const remoteAudio = document.getElementById('remote-audio');
  if (remoteAudio) remoteAudio.remove();

  // Hide call screens
  $('#call-screen').style.display = 'none';
  $('#incoming-call').style.display = 'none';
  $('#remote-video-container').style.display = 'none';
  $('#local-video').style.display = 'none';

  currentCall = null;
  callStartTime = null;
}

// ─── UTILS ───
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 172800000) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
