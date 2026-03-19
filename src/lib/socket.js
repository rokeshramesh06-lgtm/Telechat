const { getDb } = require('./db');
const { v4: uuidv4 } = require('uuid');

// Track online users
const onlineUsers = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> socketId

function initSocket(io) {
  io.on('connection', (socket) => {
    const db = getDb();

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
        FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
      `).get(id);

      const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
      members.forEach((member) => {
        const targetSocket = userSockets.get(member.user_id);
        if (targetSocket) io.to(targetSocket).emit('message:received', message);
      });
    });

    socket.on('message:read', ({ conversationId, userId }) => {
      db.prepare('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL')
        .run(conversationId, userId);
      const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId);
      members.forEach((member) => {
        const targetSocket = userSockets.get(member.user_id);
        if (targetSocket) io.to(targetSocket).emit('message:read', { conversationId, readBy: userId });
      });
    });

    socket.on('typing:start', ({ conversationId, userId, userName }) => {
      const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId);
      members.forEach((member) => {
        const targetSocket = userSockets.get(member.user_id);
        if (targetSocket) io.to(targetSocket).emit('typing:start', { conversationId, userId, userName });
      });
    });

    socket.on('typing:stop', ({ conversationId, userId }) => {
      const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').all(conversationId, userId);
      members.forEach((member) => {
        const targetSocket = userSockets.get(member.user_id);
        if (targetSocket) io.to(targetSocket).emit('typing:stop', { conversationId, userId });
      });
    });

    // Call signaling
    socket.on('call:initiate', (data) => {
      const { callerId, calleeId, callerName, conversationId, callType } = data;
      const callId = uuidv4();
      db.prepare('INSERT INTO call_logs (id, conversation_id, caller_id, callee_id, type, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(callId, conversationId, callerId, calleeId, callType, 'ringing');

      const targetSocket = userSockets.get(calleeId);
      if (targetSocket) {
        io.to(targetSocket).emit('call:incoming', { callId, callerId, callerName, conversationId, callType });
      } else {
        db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('missed', callId);
        socket.emit('call:unavailable', { callId, reason: 'User is offline' });
      }
      socket.emit('call:initiated', { callId });
    });

    socket.on('call:accept', ({ callId, calleeId, callerId }) => {
      db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('active', callId);
      const targetSocket = userSockets.get(callerId);
      if (targetSocket) io.to(targetSocket).emit('call:accepted', { callId, calleeId });
    });

    socket.on('call:reject', ({ callId, callerId }) => {
      db.prepare('UPDATE call_logs SET status = ? WHERE id = ?').run('rejected', callId);
      const targetSocket = userSockets.get(callerId);
      if (targetSocket) io.to(targetSocket).emit('call:rejected', { callId });
    });

    socket.on('call:end', ({ callId, userId, otherUserId }) => {
      const call = db.prepare('SELECT * FROM call_logs WHERE id = ?').get(callId);
      if (call) {
        const duration = Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000);
        db.prepare('UPDATE call_logs SET status = ?, ended_at = CURRENT_TIMESTAMP, duration = ? WHERE id = ?')
          .run('ended', duration, callId);
      }
      const targetSocket = userSockets.get(otherUserId);
      if (targetSocket) io.to(targetSocket).emit('call:ended', { callId });
    });

    // WebRTC signaling
    socket.on('webrtc:offer', ({ targetUserId, offer, callId }) => {
      const targetSocket = userSockets.get(targetUserId);
      if (targetSocket) io.to(targetSocket).emit('webrtc:offer', { offer, callId, fromUserId: onlineUsers.get(socket.id) });
    });

    socket.on('webrtc:answer', ({ targetUserId, answer, callId }) => {
      const targetSocket = userSockets.get(targetUserId);
      if (targetSocket) io.to(targetSocket).emit('webrtc:answer', { answer, callId, fromUserId: onlineUsers.get(socket.id) });
    });

    socket.on('webrtc:ice-candidate', ({ targetUserId, candidate }) => {
      const targetSocket = userSockets.get(targetUserId);
      if (targetSocket) io.to(targetSocket).emit('webrtc:ice-candidate', { candidate, fromUserId: onlineUsers.get(socket.id) });
    });

    socket.on('disconnect', () => {
      const userId = onlineUsers.get(socket.id);
      if (userId) {
        db.prepare('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run('offline', userId);
        io.emit('user:status', { userId, status: 'offline' });
        onlineUsers.delete(socket.id);
        userSockets.delete(userId);
      }
    });
  });
}

module.exports = { initSocket };
