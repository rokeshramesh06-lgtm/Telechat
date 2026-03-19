'use client';
import { useState, useEffect, useRef } from 'react';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000 && date.getDate() === now.getDate())
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDuration(s) {
  if (!s) return '0:00';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Sidebar({ user, conversations, activeConversation, userStatuses, onSelectConversation, onStartConversation, onLogout }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('chats');
  const [calls, setCalls] = useState([]);
  const searchTimeout = useRef(null);

  useEffect(() => {
    if (!searchQuery.trim()) { setShowSearch(false); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}&exclude=${user.id}`);
      const data = await res.json();
      setSearchResults(data);
      setShowSearch(true);
    }, 300);
  }, [searchQuery, user.id]);

  const loadCalls = async () => {
    const res = await fetch(`/api/calls?userId=${user.id}`);
    setCalls(await res.json());
  };

  const getOther = (conv) => conv.members?.find((m) => m.id !== user.id);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </button>
        <div className="search-bar">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input
            type="text" placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchQuery.trim()) setShowSearch(true); }}
          />
        </div>
      </div>

      {/* Search results */}
      {showSearch && (
        <div className="search-results">
          {searchResults.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>No users found</div>
          ) : searchResults.map((u) => (
            <div key={u.id} className="search-result-item" onClick={() => {
              onStartConversation(u);
              setSearchQuery(''); setShowSearch(false);
            }}>
              <div className="avatar small" style={{ background: u.avatar_color }}>
                {u.display_name.charAt(0).toUpperCase()}
                {(userStatuses[u.id] || u.status) === 'online' && <div className="online-dot" />}
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{u.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>@{u.username}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="sidebar-tabs">
        <button className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`} onClick={() => setActiveTab('chats')}>Chats</button>
        <button className={`tab-btn ${activeTab === 'calls' ? 'active' : ''}`} onClick={() => { setActiveTab('calls'); loadCalls(); }}>Calls</button>
      </div>

      {/* Conversations */}
      {activeTab === 'chats' && (
        <div className="conversations-list">
          {conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
              No conversations yet.<br />Search for users to start chatting!
            </div>
          ) : conversations.map((conv) => {
            const other = getOther(conv);
            if (!other) return null;
            const status = userStatuses[other.id] || other.status;
            return (
              <div key={conv.id}
                className={`conversation-item ${activeConversation?.id === conv.id ? 'active' : ''}`}
                onClick={() => onSelectConversation(conv)}
              >
                <div className="avatar" style={{ background: other.avatar_color }}>
                  {other.display_name.charAt(0).toUpperCase()}
                  {status === 'online' && <div className="online-dot" />}
                </div>
                <div className="conv-info">
                  <div className="conv-name">{other.display_name}</div>
                  <div className="conv-last-msg">{conv.last_message || 'No messages yet'}</div>
                </div>
                <div className="conv-meta">
                  <span className="conv-time">{formatTime(conv.last_message_time)}</span>
                  {conv.unread_count > 0 && <div className="unread-badge">{conv.unread_count}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Call history */}
      {activeTab === 'calls' && (
        <div className="calls-list">
          {calls.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>No call history</div>
          ) : calls.map((call) => {
            const isCaller = call.caller_id === user.id;
            const name = isCaller ? call.callee_name : call.caller_name;
            const color = isCaller ? call.callee_color : call.caller_color;
            const isMissed = call.status === 'missed' || call.status === 'rejected';
            return (
              <div key={call.id} className="call-item">
                <div className="avatar" style={{ background: color }}>{name?.charAt(0).toUpperCase()}</div>
                <div className="call-info">
                  <div className="call-info-name">{name}</div>
                  <div className="call-info-detail">
                    <span className={isMissed ? 'missed' : 'incoming'}>{isCaller ? '\u2197' : '\u2199'}</span>
                    <span>{call.type === 'video' ? '\uD83D\uDCF9' : '\uD83D\uDCDE'} {isMissed ? 'Missed' : call.status === 'ended' ? formatDuration(call.duration) : call.status}</span>
                  </div>
                </div>
                <span className="call-info-time">{formatTime(call.started_at)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Menu */}
      {showMenu && (
        <div className="sidebar-menu">
          <div className="menu-user-info">
            <div className="avatar" style={{ background: user.avatarColor }}>{user.displayName.charAt(0).toUpperCase()}</div>
            <div>
              <div className="menu-name">{user.displayName}</div>
              <div className="menu-uname">@{user.username}</div>
            </div>
          </div>
          <div className="menu-divider" />
          <button className="menu-item" onClick={onLogout}>
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
            Log Out
          </button>
        </div>
      )}
    </aside>
  );
}
