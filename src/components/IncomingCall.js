"use client";

export default function IncomingCall({ callerName, callerColor, callType, onAccept, onReject }) {
  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-pulse-ring" />
        <div
          className="avatar incoming-call-avatar"
          style={{ width: 80, height: 80, fontSize: 32, background: callerColor || "var(--accent)" }}
        >
          {(callerName || "?")[0].toUpperCase()}
        </div>
        <span className="incoming-call-name">{callerName}</span>
        <span className="incoming-call-type">
          Incoming {callType === "video" ? "video" : "voice"} call...
        </span>
        <div className="incoming-call-actions">
          <button className="incoming-btn reject-btn" onClick={onReject}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" />
              <line x1="23" y1="1" x2="1" y2="23" />
            </svg>
            <span>Decline</span>
          </button>
          <button className="incoming-btn accept-btn" onClick={onAccept}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
