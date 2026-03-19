import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi, setAuthToken } from '../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await adminApi.login(email, password);
      if (!res.data.user.isAdmin) {
        setError('Access denied: Admin account required');
        return;
      }
      setAuthToken(res.data.token);
      router.push('/');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--accent)', letterSpacing: '6px' }}>
            IGNITE
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Admin Console</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Sign In</h2>

          {error && (
            <div style={{
              background: '#EF444422',
              border: '1px solid #EF444444',
              borderRadius: '7px',
              padding: '10px 12px',
              color: '#EF4444',
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ignite.gg"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
