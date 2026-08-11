'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        let data: { error?: string } = {};
        try { data = await res.json(); } catch {}
        setError(data.error ?? 'Login failed');
      }
    } catch {
      setError('Cannot connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        .erp-login-input::placeholder { color: rgba(148,163,184,0.45); }
        .erp-login-input:focus { outline: none; }
        .erp-sign-in-btn:hover:not(:disabled) { opacity: 0.88; }
        .erp-sign-in-btn:active:not(:disabled) { transform: scale(0.99); }
        @media (prefers-reduced-motion: reduce) {
          .erp-sign-in-btn { transition: none !important; }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 90% 55% at 50% -10%, rgba(99,102,241,0.18) 0%, rgba(124,58,237,0.10) 30%, transparent 65%), #050816',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          {/* Brand area */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '15px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
              marginBottom: '1rem',
              boxShadow: '0 0 0 1px rgba(124,58,237,0.3), 0 8px 32px rgba(124,58,237,0.4)',
            }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M14 3L25 9.5V20.5L14 27L3 20.5V9.5L14 3Z" fill="white" fillOpacity="0.92"/>
                <path d="M14 8.5L21 12.5V20L14 24L7 20V12.5L14 8.5Z" fill="rgba(0,0,20,0.28)"/>
                <circle cx="14" cy="14" r="3" fill="white" fillOpacity="0.85"/>
              </svg>
            </div>
            <h1 style={{
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#f1f5f9',
              letterSpacing: '-0.015em',
              margin: '0 0 0.3rem',
            }}>
              ERP Admin Panel
            </h1>
            <p style={{
              fontSize: '0.8125rem',
              color: 'rgba(148,163,184,0.65)',
              margin: 0,
            }}>
              Sign in to your workspace
            </p>
          </div>

          {/* Card */}
          <div style={{
            background: 'rgba(255,255,255,0.038)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.085)',
            borderRadius: '18px',
            padding: '2rem',
            boxShadow: '0 32px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
          }}>
            <form onSubmit={handleSubmit}>

              {/* Username */}
              <div style={{ marginBottom: '1.125rem' }}>
                <label htmlFor="username" style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: 'rgba(203,213,225,0.85)',
                  marginBottom: '0.4375rem',
                  letterSpacing: '0.005em',
                }}>
                  Username
                </label>
                <input
                  id="username"
                  className="erp-login-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.625rem 0.9375rem',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '9px',
                    color: '#f1f5f9',
                    fontSize: '0.9375rem',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    caretColor: '#818cf8',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.65)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.14)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '1.375rem' }}>
                <label htmlFor="password" style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: 'rgba(203,213,225,0.85)',
                  marginBottom: '0.4375rem',
                  letterSpacing: '0.005em',
                }}>
                  Password
                </label>
                <input
                  id="password"
                  className="erp-login-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.625rem 0.9375rem',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '9px',
                    color: '#f1f5f9',
                    fontSize: '0.9375rem',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    caretColor: '#818cf8',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.65)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.14)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginBottom: '1.125rem',
                  padding: '0.625rem 0.9375rem',
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.22)',
                  borderRadius: '9px',
                  fontSize: '0.8125rem',
                  color: '#fca5a5',
                  lineHeight: '1.4',
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className="erp-sign-in-btn"
                disabled={loading}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.6875rem 1rem',
                  background: loading
                    ? 'rgba(99,102,241,0.35)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
                  border: 'none',
                  borderRadius: '9px',
                  color: '#ffffff',
                  fontSize: '0.9375rem',
                  fontWeight: '600',
                  letterSpacing: '0.01em',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease',
                  boxShadow: loading ? 'none' : '0 4px 18px rgba(124,58,237,0.42)',
                }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

            </form>
          </div>

          {/* Footer */}
          <p style={{
            textAlign: 'center',
            marginTop: '1.75rem',
            fontSize: '0.6875rem',
            color: 'rgba(71,85,105,0.8)',
            letterSpacing: '0.03em',
          }}>
            SECURED ERP MANAGEMENT SYSTEM
          </p>

        </div>
      </div>
    </>
  );
}
