'use client';
import { useState, useEffect } from 'react';
import AuthScreen from '../components/AuthScreen';
import ChatApp from '../components/ChatApp';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('telechat_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch (e) { localStorage.removeItem('telechat_user'); }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('telechat_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('telechat_user');
  };

  if (loading) return null;

  if (!user) return <AuthScreen onLogin={handleLogin} />;
  return <ChatApp user={user} onLogout={handleLogout} />;
}
