import React, { useState } from 'react';
import Layout from '../components/Layout';
import { adminApi } from '../lib/api';

export default function AllowlistPage() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      await adminApi.addAllowlist(email.trim().toLowerCase(), note || undefined);
      setMessage(`✓ ${email} added to allowlist`);
      setEmail('');
      setNote('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Invite Allowlist</h1>
      </div>

      <div style={{ maxWidth: '480px' }}>
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: '16px' }}>Add Email to Allowlist</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px', lineHeight: 1.6 }}>
            Ignite is invite-only. Add an email here to allow registration with that address.
          </p>

          {message && (
            <div style={{
              background: '#4ADE8022',
              border: '1px solid #4ADE8044',
              borderRadius: '7px',
              padding: '10px 12px',
              color: '#4ADE80',
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              {message}
            </div>
          )}

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

          <form onSubmit={handleAdd}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="How you know this person..."
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isLoading ? 'Adding...' : 'Add to Allowlist'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
