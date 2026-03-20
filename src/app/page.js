"use client";
import { useState, useEffect } from "react";
import AuthScreen from "@/components/AuthScreen";
import ChatApp from "@/components/ChatApp";

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="14" fill="#00a884" />
            <path
              d="M14 34l2.5-7.5C15.5 24.5 15 22.3 15 20c0-5 4-9 9-9s9 4 9 9-4 9-9 9c-2 0-3.8-.6-5.3-1.6L14 34z"
              stroke="white"
              strokeWidth="2"
              fill="none"
            />
            <path d="M20 19h8M20 23h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="loading-spinner" />
        <span className="loading-text">TeleChat</span>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  return <ChatApp initialUser={user} onLogout={() => setUser(null)} />;
}
