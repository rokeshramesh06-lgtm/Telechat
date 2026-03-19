'use client';
import { useState } from 'react';

export default function AuthScreen({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const url = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const body = isSignup
        ? { username, password, displayName }
        : { username, password };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-container">
        <div className="auth-logo">
          <svg viewBox="0 0 48 48" width="80" height="80" fill="none">
            <circle cx="24" cy="24" r="24" fill="#0088cc" />
            <path d="M34 14L20 28l-6-4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M10 22l14-8 14 6-4 16-10 2-8-6z" fill="white" opacity="0.2" />
          </svg>
          <h1>TeleChat</h1>
          <p className="auth-subtitle">Fast. Secure. Powerful.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>{isSignup ? 'Create Account' : 'Sign In'}</h2>

          {isSignup && (
            <div className="input-group">
              <input
                type="text" placeholder="Display Name" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} required
              />
            </div>
          )}
          <div className="input-group">
            <input
              type="text" placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)} autoComplete="username" required
            />
          </div>
          <div className="input-group">
            <input
              type="password" placeholder={isSignup ? 'Password (6+ characters)' : 'Password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'} required
            />
          </div>
          <button type="submit" className="btn-primary">
            {isSignup ? 'Create Account' : 'Sign In'}
          </button>
          <p className="auth-switch">
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <a href="#" onClick={(e) => { e.preventDefault(); setIsSignup(!isSignup); setError(''); }}>
              {isSignup ? 'Sign In' : 'Sign Up'}
            </a>
          </p>
          {error && <div className="error-msg">{error}</div>}
        </form>
      </div>
    </div>
  );
}
