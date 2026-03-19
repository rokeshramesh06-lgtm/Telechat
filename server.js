const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Track online users: { socketId: userId }
const onlineUsers = new Map();
// Track userId to socketId mapping
const userSockets = new Map();

// ─── AUTH ROUTES ───

app.post('/api/signup', (req, res) => {
  const { username, displayName, password } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Username must be 3+ chars, password 6+ chars' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const colors = ['#0088cc', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  db.prepare(
    'INSERT INTO users (id, username, display_name, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)'
  ).run(id, username, displayName, passwordHash, avatarColor);

  res.json({ id, username, displayName, avatarColor });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarColor: user.avatar_color,
  });
});

// ─── USER ROUTES ───

app.get('/api/users', (req, res) => {
  const { exclude } = req.query;
  let users;
  if (exclude) {
    users = db.prepare('SELECT id, username, display_name, avatar_color, status, last_seen FROM users WHERE id != ?').all(exclude);
  } else {
    users = db.prepare('SELECT id, username, display_name, avatar_color, status, last_seen FROM users').all();
  }
  res.json(users);
});

app.get('/api/users/search', (req, res) => {
  const { q, exclude } = req.query;
  if (!q) return res.json([]);
  const users = db.prepare(
    'SELECT id, username, display_name, avatar_color, status FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?'
  ).all(`%${q}%`, `%${q}%`, exclude || '');
  res.json(users);
});

// ─── CONVERSATION ROUTES ───

app.get('/api/conversations/:userId', (req, res) => {
  const { userId } = req.params;
  const conversations = db.prepare(`
    SELECT c.id, c.type, c.name, c.created_at,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) as unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY last_message_time DESC NULLS LAST
  `).all(userId, userId);

  // Attach member info for private chats
  const enriched = conversations.map((conv) => {
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
      FROM users u
      JOIN conversation_members cm ON cm.user_id = u.id
      WHERE cm.conversation_id = ?
    `).all(conv.id);
    return { ...conv, members };
  });

  res.json(enriched);
});

app.post('/api/conversations', (req, res) => {
  const { userId, otherUserId } = req.body;

  // Check if private conversation already exists between these users
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
    WHERE c.type = 'private'
  `).get(userId, otherUserId);

  if (existing) {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(existing.id);
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
      FROM users u JOIN conversation_members cm ON cm.user_id = u.id
      WHERE cm.conversation_id = ?
    `).all(conv.id);
    return res.json({ ...conv, members });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id, type) VALUES (?, ?)').run(id, 'private');
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, userId);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(id, otherUserId);

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_color, u.status
    FROM users u JOIN conversation_members cm ON cm.user_id = u.id
    WHERE cm.conversation_id = ?
  `).all(id);

  res.json({ ...conv, members });
});

// ─── MESSAGE ROUTES ───

app.get('/api/messages/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const messages = db.prepare(`
    SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_color as sender_color
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(conversationId);
  res.json(messages);
});

// ─── CALL LOG ROUTES ───

app.get('/api/calls/:userId', (req, res) => {
  const { userId } = req.params;
  const calls = db.prepare(`
    SELECT cl.*,
      caller.display_name as caller_name, caller.avatar_color as caller_color,
      callee.display_name as callee_name, callee.avatar_color as callee_color
    FROM call_logs cl
    JOIN users caller ON caller.id = cl.caller_id
    JOIN users callee ON callee.id = cl.callee_id
    WHERE cl.caller_id = ? OR cl.callee_id = ?
    ORDER BY cl.started_at DESC
    LIMIT 50
  `).all(userId, userId);
  res.json(calls);
});

// ─── SOCKET.IO ───

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('user:online', (userId) => {
    onlineUsers.set(socket.id, userId);
    userSockets.set(userId, socket.id);
    db.prepare('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run('online', userId);
    io.emit('user:status', { userId, status: 'online' });
  });

  socket.on('message:send', (data) => {
    const { conversationId, senderId, content, type } = data;
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO messages (id, conversation_id, sender_id, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, conversationId, senderId, content, type || 'text', now);

    const message = db.prepare(`
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_color as sender_color
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `).get(id);

    // Get conversation members and emit to all
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
    members.forEach((member) => {
      const targetSocket = userSockets.get(member.user_id);
      if (targetSocket) {
        io.to(targetSocket).emit('message:received', message);
      }
    });
  });

  socket.on('message:read', ({ conversationId, userId }) => {
    db.prepare('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL')
      .run(conversationId, userId);
    // Notify the other user that messages were read
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId);
    members.forEach((member) => {
      const targetSocket = userSockets.get(member.user_id);
      if (targetSocket) {
        io.to(targetSocket).emit('message:read', { conversationId, readBy: userId });
      }
    });
  });

  socket.on('typing:start', ({ conversationId, userId, userName }) => {
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId);
    members.forEach((member) => {
      const targetSocket = userSockets.get(member.user_id);
      if (targetSocket) {
        io.to(targetSocket).emit('typing:start', { conversationId, userId, userName });
      }
    });
  });

  socket.on('typing:stop', ({ conversationId, userId }) => {
    const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId);
    members.forEach((member) => {
      const targetSocket = userSockets.get(member.user_id);
      if (targetSocket) {
        io.to(targetSocket).emit('typing:stop', { conversationId, userId });
      }
    });
  });

  // ─── WEBRTC SIGNALING FOR CALLS ───

  socket.on('call:initiate', (data) => {
    const { callerId, calleeId, callerName, conversationId, callType } = data;
    const targetSocket = userSockets.get(calleeId);

    // Log the call
    const callId = uuidv4();
    db.prepare(
      'INSERT INTO call_logs (id, conversation_id, caller_id, callee_id, type, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(callId, conversationId, callerId, calleeId, callType, 'ringing');

    if (targetSocket) {
      io.to(targetSocket).emit('call:incoming', {
        callId,
        callerId,
        callerName,
        conversationId,
        callType,
      });
    } else {
      // User offline
      db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('missed', callId);
      socket.emit('call:unavailable', { callId, reason: 'User is offline' });
    }

    socket.emit('call:initiated', { callId });
  });

  socket.on('call:accept', ({ callId, calleeId, callerId }) => {
    db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('active', callId);
    const targetSocket = userSockets.get(callerId);
    if (targetSocket) {
      io.to(targetSocket).emit('call:accepted', { callId, calleeId });
    }
  });

  socket.on('call:reject', ({ callId, callerId, calleeId }) => {
    db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('rejected', callId);
    const targetSocket = userSockets.get(callerId);
    if (targetSocket) {
      io.to(targetSocket).emit('call:rejected', { callId });
    }
  });

  socket.on('call:end', ({ callId, userId, otherUserId }) => {
    const call = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(callId);
    if (call) {
      const duration = Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000);
      db.prepare('UPDATE call_logs SET status = ?, ended_at = CURRENT_TIMESTAMP, duration = ? WHERE id = ?')
        .run('ended', duration, callId);
    }
    const targetSocket = userSockets.get(otherUserId);
    if (targetSocket) {
      io.to(targetSocket).emit('call:ended', { callId });
    }
  });

  // WebRTC signaling
  socket.on('webrtc:offer', ({ targetUserId, offer, callId }) => {
    const targetSocket = userSockets.get(targetUserId);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:offer', { offer, callId, fromUserId: onlineUsers.get(socket.id) });
    }
  });

  socket.on('webrtc:answer', ({ targetUserId, answer, callId }) => {
    const targetSocket = userSockets.get(targetUserId);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:answer', { answer, callId, fromUserId: onlineUsers.get(socket.id) });
    }
  });

  socket.on('webrtc:ice-candidate', ({ targetUserId, candidate, callId }) => {
    const targetSocket = userSockets.get(targetUserId);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:ice-candidate', { candidate, callId, fromUserId: onlineUsers.get(socket.id) });
    }
  });

  socket.on('disconnect', () => {
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      db.prepare('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run('offline', userId);
      io.emit('user:status', { userId, status: 'offline' });
      onlineUsers.delete(socket.id);
      userSockets.delete(userId);
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ─── START SERVER ───

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TeleChat server running on http://localhost:${PORT}`);
});
