"use client";
import { useState, useEffect, useRef } from "react";
import { Avatar } from "./Sidebar";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function ChatArea({
  conversation,
  messages,
  currentUser,
  onSendMessage,
  onStartCall,
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  function handleScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAutoScroll(atBottom);
  }

  function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput("");
    setAutoScroll(true);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  if (!conversation) {
    return (
      <div className="chat-area empty-chat">
        <div className="empty-chat-content">
          <div className="empty-chat-icon">
            <svg width="80" height="80" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="14" fill="var(--accent)" opacity="0.15" />
              <path
                d="M14 34l2.5-7.5C15.5 24.5 15 22.3 15 20c0-5 4-9 9-9s9 4 9 9-4 9-9 9c-2 0-3.8-.6-5.3-1.6L14 34z"
                stroke="var(--accent)"
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </div>
          <h2>TeleChat Web</h2>
          <p>Send and receive messages, make calls, and stay connected.</p>
          <p className="empty-hint">Select a conversation or search for a user to get started.</p>
        </div>
      </div>
    );
  }

  const otherMember = conversation.members?.find((m) => m.id !== currentUser.userId);

  // Group messages by date
  let lastDate = null;

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-left">
          <Avatar
            name={conversation.name}
            color={conversation.avatarColor}
            size={40}
          />
          <div className="chat-header-info">
            <span className="chat-header-name">{conversation.name}</span>
            <span className="chat-header-status">
              {otherMember &&
                (Math.floor(Date.now() / 1000) - (otherMember.lastSeen || 0) < 30
                  ? "online"
                  : "offline")}
            </span>
          </div>
        </div>
        <div className="chat-header-right">
          <button
            className="icon-btn"
            title="Voice call"
            onClick={() => onStartCall("audio")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
          </button>
          <button
            className="icon-btn"
            title="Video call"
            onClick={() => onStartCall("video")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="messages-container"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        <div className="messages-list">
          {messages.map((msg, i) => {
            const msgDate = formatDateSeparator(msg.createdAt);
            let showDate = false;
            if (msgDate !== lastDate) {
              showDate = true;
              lastDate = msgDate;
            }

            const isOwn = msg.senderId === currentUser.userId;
            const showTail =
              i === messages.length - 1 ||
              messages[i + 1]?.senderId !== msg.senderId;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="date-separator">
                    <span>{msgDate}</span>
                  </div>
                )}
                <div className={`message ${isOwn ? "message-out" : "message-in"} ${showTail ? "with-tail" : ""}`}>
                  <div className="message-bubble">
                    <span className="message-text">{msg.content}</span>
                    <span className="message-meta">
                      <span className="message-time">{formatTime(msg.createdAt)}</span>
                      {isOwn && (
                        <svg className="message-check" width="16" height="11" viewBox="0 0 16 11">
                          <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.46.46 0 0 0-.327-.153.457.457 0 0 0-.334.135.52.52 0 0 0 0 .724l2.343 2.442a.46.46 0 0 0 .312.168h.038a.46.46 0 0 0 .312-.143l6.541-8.065a.477.477 0 0 0 .001-.725z" fill="var(--accent)" />
                        </svg>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form className="message-input-container" onSubmit={handleSend}>
        <div className="message-input-box">
          <textarea
            className="message-input"
            placeholder="Type a message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>
        <button type="submit" className="send-btn" disabled={!input.trim()}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}
