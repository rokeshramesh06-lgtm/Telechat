'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import CallScreen from './CallScreen';
import IncomingCall from './IncomingCall';

export default function ChatApp({ user, onLogout }) {
  const [socket, setSocket] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [userStatuses, setUserStatuses] = useState({});
  const [mobileChat, setMobileChat] = useState(false);

  // Call state
  const [currentCall, setCurrentCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callStatus, setCallStatus] = useState('');

  const activeConvRef = useRef(null);
  const callRef = useRef(null);

  useEffect(() => { activeConvRef.current = activeConversation; }, [activeConversation]);
  useEffect(() => { callRef.current = currentCall; }, [currentCall]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const res = await fetch(`/api/conversations?userId=${user.id}`);
    const data = await res.json();
    setConversations(data);
  }, [user.id]);

  // Socket setup
  useEffect(() => {
    const s = io();
    setSocket(s);

    s.emit('user:online', user.id);

    s.on('message:received', (msg) => {
      setMessages((prev) => {
        if (activeConvRef.current && msg.conversation_id === activeConvRef.current.id) {
          if (msg.sender_id !== user.id) {
            s.emit('message:read', { conversationId: activeConvRef.current.id, userId: user.id });
          }
          return [...prev, msg];
        }
        return prev;
      });
      loadConversations();
    });

    s.on('user:status', ({ userId, status }) => {
      setUserStatuses((prev) => ({ ...prev, [userId]: status }));
    });

    s.on('typing:start', ({ conversationId, userName }) => {
      if (activeConvRef.current?.id === conversationId) setTypingUser(userName);
    });

    s.on('typing:stop', ({ conversationId }) => {
      if (activeConvRef.current?.id === conversationId) setTypingUser(null);
    });

    // Call events
    s.on('call:incoming', (data) => setIncomingCall(data));
    s.on('call:initiated', ({ callId }) => {
      setCurrentCall((prev) => prev ? { ...prev, callId } : prev);
    });
    s.on('call:accepted', ({ callId, calleeId }) => {
      setCallStatus('Connecting...');
      // Signal to CallScreen to start WebRTC as caller
      setCurrentCall((prev) => prev ? { ...prev, accepted: true, targetUserId: calleeId } : prev);
    });
    s.on('call:rejected', () => {
      setCallStatus('Call declined');
      setTimeout(() => { setCurrentCall(null); setCallStatus(''); }, 1500);
    });
    s.on('call:unavailable', ({ reason }) => {
      setCallStatus(reason);
      setTimeout(() => { setCurrentCall(null); setCallStatus(''); }, 1500);
    });
    s.on('call:ended', () => { setCurrentCall(null); setCallStatus(''); });

    // WebRTC signaling — forwarded to CallScreen via state
    s.on('webrtc:offer', (data) => {
      setCurrentCall((prev) => prev ? { ...prev, remoteOffer: data } : prev);
    });
    s.on('webrtc:answer', (data) => {
      setCurrentCall((prev) => prev ? { ...prev, remoteAnswer: data } : prev);
    });
    s.on('webrtc:ice-candidate', (data) => {
      setCurrentCall((prev) => prev ? { ...prev, remoteCandidate: { ...data, _ts: Date.now() } } : prev);
    });

    loadConversations();

    return () => { s.disconnect(); };
  }, [user.id, loadConversations]);

  // Open conversation
  const openConversation = async (conv) => {
    setActiveConversation(conv);
    setMobileChat(true);
    setTypingUser(null);
    const res = await fetch(`/api/messages?conversationId=${conv.id}`);
    const data = await res.json();
    setMessages(data);
    if (socket) socket.emit('message:read', { conversationId: conv.id, userId: user.id });
    loadConversations();
  };

  // Send message
  const sendMessage = (content) => {
    if (!content.trim() || !activeConversation || !socket) return;
    socket.emit('message:send', {
      conversationId: activeConversation.id,
      senderId: user.id,
      content,
      type: 'text',
    });
    socket.emit('typing:stop', { conversationId: activeConversation.id, userId: user.id });
  };

  // Typing
  const sendTyping = (isTyping) => {
    if (!activeConversation || !socket) return;
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', {
      conversationId: activeConversation.id,
      userId: user.id,
      userName: user.displayName,
    });
  };

  // Start conversation from search
  const startConversation = async (otherUser) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, otherUserId: otherUser.id }),
    });
    const conv = await res.json();
    await loadConversations();
    openConversation(conv);
  };

  // Initiate call
  const initiateCall = (callType) => {
    if (!activeConversation || currentCall || !socket) return;
    const other = activeConversation.members?.find((m) => m.id !== user.id);
    if (!other) return;

    const callData = {
      callerId: user.id,
      calleeId: other.id,
      callerName: user.displayName,
      conversationId: activeConversation.id,
      callType,
      role: 'caller',
      otherName: other.display_name,
      otherColor: other.avatar_color,
    };

    setCurrentCall(callData);
    setCallStatus('Calling...');
    socket.emit('call:initiate', callData);
  };

  // Accept incoming call
  const acceptCall = () => {
    if (!incomingCall || !socket) return;
    socket.emit('call:accept', {
      callId: incomingCall.callId,
      calleeId: user.id,
      callerId: incomingCall.callerId,
    });
    setCurrentCall({
      ...incomingCall,
      role: 'callee',
      otherName: incomingCall.callerName,
      otherColor: '#0088cc',
      accepted: true,
      targetUserId: incomingCall.callerId,
    });
    setCallStatus('Connecting...');
    setIncomingCall(null);
  };

  // Decline incoming call
  const declineCall = () => {
    if (!incomingCall || !socket) return;
    socket.emit('call:reject', {
      callId: incomingCall.callId,
      callerId: incomingCall.callerId,
      calleeId: user.id,
    });
    setIncomingCall(null);
  };

  // End call
  const endCall = () => {
    if (!currentCall || !socket) return;
    const otherUserId = currentCall.role === 'caller' ? currentCall.calleeId : currentCall.callerId;
    socket.emit('call:end', {
      callId: currentCall.callId,
      userId: user.id,
      otherUserId,
    });
    setCurrentCall(null);
    setCallStatus('');
  };

  // Helper to get other user
  const getOtherUser = (conv) => conv?.members?.find((m) => m.id !== user.id);

  return (
    <div className={`chat-screen${mobileChat ? ' chat-open' : ''}`}>
      <Sidebar
        user={user}
        conversations={conversations}
        activeConversation={activeConversation}
        userStatuses={userStatuses}
        onSelectConversation={openConversation}
        onStartConversation={startConversation}
        onLogout={onLogout}
      />
      <ChatArea
        user={user}
        conversation={activeConversation}
        messages={messages}
        typingUser={typingUser}
        userStatuses={userStatuses}
        onSendMessage={sendMessage}
        onSendTyping={sendTyping}
        onVoiceCall={() => initiateCall('voice')}
        onVideoCall={() => initiateCall('video')}
        onBack={() => setMobileChat(false)}
        getOtherUser={getOtherUser}
      />

      {currentCall && (
        <CallScreen
          call={currentCall}
          socket={socket}
          user={user}
          status={callStatus}
          onEnd={endCall}
        />
      )}

      {incomingCall && (
        <IncomingCall
          call={incomingCall}
          onAccept={acceptCall}
          onDecline={declineCall}
        />
      )}
    </div>
  );
}
