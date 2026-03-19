'use client';
import { useEffect, useRef, useState } from 'react';

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ChatArea({ user, conversation, messages, typingUser, userStatuses, onSendMessage, onSendTyping, onVoiceCall, onVideoCall, onBack, getOtherUser }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    if (!typingTimeoutRef.current) {
      onSendTyping(true);
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onSendTyping(false);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  if (!conversation) {
    return (
      <main className="chat-area">
        <div className="empty-state">
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="38" fill="none" stroke="#0088cc" strokeWidth="2" opacity="0.3"/>
            <path d="M25 30h30v4H25zm0 8h20v4H25zm0 8h25v4H25z" fill="#0088cc" opacity="0.3"/>
          </svg>
          <h3>Select a chat to start messaging</h3>
          <p>Or search for users to start a new conversation</p>
        </div>
      </main>
    );
  }

  const other = getOtherUser(conversation);
  const status = userStatuses[other?.id] || other?.status;

  // Group messages by date
  let lastDate = '';

  return (
    <main className="chat-area">
      {/* Header */}
      <div className="chat-header">
        <button className="icon-btn mobile-only" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <div className="chat-user-info">
          <div className="avatar" style={{ background: other?.avatar_color }}>
            {other?.display_name?.charAt(0).toUpperCase()}
            {status === 'online' && <div className="online-dot" />}
          </div>
          <div>
            <div className="chat-name">{other?.display_name}</div>
            <div className={`chat-status ${status === 'online' ? 'online' : ''}`}>
              {status === 'online' ? 'online' : 'offline'}
            </div>
          </div>
        </div>
        <div className="chat-actions">
          <button className="icon-btn" title="Voice Call" onClick={onVoiceCall}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
          </button>
          <button className="icon-btn" title="Video Call" onClick={onVideoCall}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        <div className="messages-list">
          {messages.map((msg, i) => {
            const msgDate = new Date(msg.created_at).toLocaleDateString();
            let dateDivider = null;
            if (msgDate !== lastDate) {
              lastDate = msgDate;
              dateDivider = (
                <div className="message-date-divider" key={`date-${msgDate}`}>
                  <span>{formatDate(msg.created_at)}</span>
                </div>
              );
            }
            const isOutgoing = msg.sender_id === user.id;
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={msg.id || i}>
                {dateDivider}
                <div className={`message ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                  <div className="message-bubble">
                    {!isOutgoing && (
                      <div className="message-sender" style={{ color: msg.sender_color }}>{msg.sender_name}</div>
                    )}
                    <div className="message-text">{msg.content}</div>
                    <div className="message-time">{time}</div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Typing */}
      {typingUser && (
        <div className="typing-indicator">
          <span>{typingUser}</span> is typing
          <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
      )}

      {/* Input */}
      <div className="message-input-area">
        <div className="input-wrapper">
          <textarea
            placeholder="Message"
            rows="1"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
          />
          <button className="icon-btn send-btn" onClick={handleSend}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </main>
  );
}
