"use client";
import { useState, useEffect, useRef } from "react";

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Avatar({ name, color, size = 48 }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: color || "#00a884",
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  );
}

export default function Sidebar({
  currentUser,
  conversations,
  activeConversation,
  onSelectConversation,
  onNewChat,
  onLogout,
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (search.length < 1) {
      setSearchResults([]);
      return;
    }

    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setSearchResults(data.users || []);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(searchTimer.current);
  }, [search]);

  async function startChat(user) {
    setSearch("");
    setSearchResults([]);
    await onNewChat(user.id);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-left">
          <button className="icon-btn profile-btn" onClick={() => setShowProfile(!showProfile)}>
            <Avatar name={currentUser.displayName} color={currentUser.avatarColor} size={38} />
          </button>
          <span className="sidebar-title">Chats</span>
        </div>
        <div className="sidebar-header-right">
          <button className="icon-btn" onClick={onLogout} title="Log out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>

      {showProfile && (
        <div className="profile-dropdown">
          <Avatar name={currentUser.displayName} color={currentUser.avatarColor} size={64} />
          <div className="profile-info">
            <span className="profile-name">{currentUser.displayName}</span>
            <span className="profile-username">@{currentUser.username}</span>
          </div>
        </div>
      )}

      <div className="search-container">
        <div className="search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search or start a new chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="conversations-list">
        {search.length > 0 ? (
          <>
            {searching && <div className="list-status">Searching...</div>}
            {!searching && searchResults.length === 0 && search.length > 0 && (
              <div className="list-status">No users found</div>
            )}
            {searchResults.map((user) => (
              <button key={user.id} className="conversation-item" onClick={() => startChat(user)}>
                <Avatar name={user.displayName} color={user.avatarColor} size={48} />
                <div className="conversation-info">
                  <div className="conversation-top">
                    <span className="conversation-name">{user.displayName}</span>
                  </div>
                  <span className="conversation-preview">@{user.username}</span>
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            {conversations.length === 0 && (
              <div className="list-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <p>No conversations yet</p>
                <p className="list-empty-hint">Search for users to start chatting</p>
              </div>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                className={`conversation-item ${activeConversation === conv.id ? "active" : ""}`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <Avatar name={conv.name} color={conv.avatarColor} size={48} />
                <div className="conversation-info">
                  <div className="conversation-top">
                    <span className="conversation-name">{conv.name}</span>
                    <span className="conversation-time">{timeAgo(conv.lastMessageTime)}</span>
                  </div>
                  <span className="conversation-preview">
                    {conv.lastMessage
                      ? conv.lastMessage.length > 45
                        ? conv.lastMessage.slice(0, 45) + "..."
                        : conv.lastMessage
                      : "No messages yet"}
                  </span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export { Avatar };
