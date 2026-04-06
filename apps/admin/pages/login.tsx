import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi, setAuthToken } from '../lib/api';
import { Button } from '../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@ignite.gg');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.login(email, password);
      setAuthToken(res.data.token);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #1a0a0a 0%, #080810 60%)',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: 'linear-gradient(140deg,#ef4444,#991b1b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(239,68,68,0.4)',
          }}>🔥</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, color: '#f0f0f5' }}>IGNITE</h1>
          <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 13, marginTop: 4 }}>Admin Console</p>
        </div>

        {/* Card */}
        <div style={{
          background: '#121220',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '28px 28px 24px',
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@ignite.gg"
                required
                style={{ marginTop: 6 }}
              />
            </div>

            <div style={{ marginBottom: error ? 16 : 24 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ marginTop: 6 }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 9, padding: '10px 14px',
                color: '#f87171', fontSize: 13, marginBottom: 18,
              }}>
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '20px 0' }} />
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            Default: admin@ignite.gg / AdminPass123!
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 24 }}>
          © 2026 IGNITE. All rights reserved.
        </p>
      </div>
    </div>
  );
}
