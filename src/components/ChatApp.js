"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";
import CallScreen from "./CallScreen";
import IncomingCall from "./IncomingCall";

export default function ChatApp({ initialUser, onLogout }) {
  const [user] = useState(initialUser);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState({});
  const [callState, setCallState] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const lastPollTime = useRef(Math.floor(Date.now() / 1000) - 1);
  const pollIntervalRef = useRef(null);
  const signalPollRef = useRef(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch {}
  }, []);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (convId) => {
    try {
      const res = await fetch(`/api/messages?conversationId=${convId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages((prev) => ({ ...prev, [convId]: data.messages }));
      }
    } catch {}
  }, []);

  // Poll for new messages
  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/poll?since=${lastPollTime.current}`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        const grouped = {};
        for (const msg of data.messages) {
          if (!grouped[msg.conversationId]) grouped[msg.conversationId] = [];
          grouped[msg.conversationId].push(msg);
          if (msg.createdAt > lastPollTime.current) {
            lastPollTime.current = msg.createdAt;
          }
        }

        setMessages((prev) => {
          const next = { ...prev };
          for (const [convId, msgs] of Object.entries(grouped)) {
            const existing = next[convId] || [];
            const existingIds = new Set(existing.map((m) => m.id));
            const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
            if (newMsgs.length > 0) {
              next[convId] = [...existing, ...newMsgs];
            }
          }
          return next;
        });

        fetchConversations();
      }
    } catch {}
  }, [fetchConversations]);

  // Poll for call signals
  const pollCallSignals = useCallback(async () => {
    if (callState) return; // Already in a call
    try {
      const res = await fetch("/api/calls/signal");
      const data = await res.json();
      for (const signal of data.signals || []) {
        if (signal.signalType === "offer" && !incomingCall && !callState) {
          setIncomingCall({
            callerId: signal.callerId,
            callerName: signal.callerName,
            callerColor: signal.callerColor,
            conversationId: signal.conversationId,
            callType: signal.signalData.sdp?.includes("m=video") ? "video" : "audio",
            offer: signal.signalData,
          });
        }
      }
    } catch {}
  }, [callState, incomingCall]);

  // Initial load
  useEffect(() => {
    fetchConversations();
    pollIntervalRef.current = setInterval(pollMessages, 2000);
    signalPollRef.current = setInterval(pollCallSignals, 1500);

    return () => {
      clearInterval(pollIntervalRef.current);
      clearInterval(signalPollRef.current);
    };
  }, [fetchConversations, pollMessages, pollCallSignals]);

  // Load messages when switching conversations
  useEffect(() => {
    if (activeConvId && !messages[activeConvId]) {
      fetchMessages(activeConvId);
    }
  }, [activeConvId, messages, fetchMessages]);

  async function handleNewChat(userId) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.conversationId) {
        await fetchConversations();
        setActiveConvId(data.conversationId);
        fetchMessages(data.conversationId);
      }
    } catch {}
  }

  async function handleSendMessage(content) {
    if (!activeConvId) return;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeConvId, content }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => ({
          ...prev,
          [activeConvId]: [...(prev[activeConvId] || []), data.message],
        }));
        if (data.message.createdAt > lastPollTime.current) {
          lastPollTime.current = data.message.createdAt;
        }
        fetchConversations();
      }
    } catch {}
  }

  function handleStartCall(callType) {
    if (!activeConvId) return;
    const conv = conversations.find((c) => c.id === activeConvId);
    if (!conv) return;
    const other = conv.members?.find((m) => m.id !== user.userId);
    if (!other) return;

    setCallState({
      calleeId: other.id,
      callerName: other.displayName,
      callType,
      isIncoming: false,
      conversationId: activeConvId,
    });
  }

  function handleAcceptCall() {
    if (!incomingCall) return;
    setCallState({
      calleeId: incomingCall.callerId,
      callerName: incomingCall.callerName,
      callType: incomingCall.callType,
      isIncoming: true,
      conversationId: incomingCall.conversationId,
      offer: incomingCall.offer,
    });
    setIncomingCall(null);
  }

  function handleRejectCall() {
    if (!incomingCall) return;
    fetch("/api/calls/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calleeId: incomingCall.callerId,
        conversationId: incomingCall.conversationId,
        signalType: "hangup",
        signalData: { reason: "rejected" },
      }),
    });
    setIncomingCall(null);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    onLogout();
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="app-container">
      <Sidebar
        currentUser={user}
        conversations={conversations}
        activeConversation={activeConvId}
        onSelectConversation={(id) => {
          setActiveConvId(id);
          if (!messages[id]) fetchMessages(id);
        }}
        onNewChat={handleNewChat}
        onLogout={handleLogout}
      />
      <ChatArea
        conversation={activeConv}
        messages={messages[activeConvId] || []}
        currentUser={user}
        onSendMessage={handleSendMessage}
        onStartCall={handleStartCall}
      />

      {callState && (
        <CallScreen
          callState={callState}
          currentUser={user}
          onEndCall={() => setCallState(null)}
        />
      )}

      {incomingCall && !callState && (
        <IncomingCall
          callerName={incomingCall.callerName}
          callerColor={incomingCall.callerColor}
          callType={incomingCall.callType}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}
    </div>
  );
}
