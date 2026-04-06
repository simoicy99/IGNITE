import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { adminApi } from '../../lib/api';
import Link from 'next/link';

interface Match {
  id: string;
  game: string;
  status: string;
  stakeCents: number;
  creator: { handle: string; email: string };
  accepter: { handle: string; email: string } | null;
  createdAt: string;
  submittedAt: string | null;
  disputeDeadline: string | null;
  chessLink: string | null;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    loadMatches();
  }, [filter]);

  async function loadMatches() {
    setIsLoading(true);
    try {
      const q = new URLSearchParams();
      if (filter !== 'ALL') q.set('status', filter);
      if (cursor) q.set('cursor', cursor);
      
      const res = await adminApi.getMatches(q.toString());
      setMatches(res.data.items);
      setCursor(res.data.nextCursor);
    } catch (err) {
      console.error('Failed to load matches:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const statusColors: Record<string, string> = {
    CREATED: 'var(--text-secondary)',
    ACCEPTED: 'var(--warning)',
    FUNDED: 'var(--info)',
    IN_PROGRESS: 'var(--accent)',
    SUBMITTED: 'var(--warning)',
    VERIFIED: 'var(--success)',
    SETTLED: 'var(--success)',
    DISPUTED: 'var(--danger)',
    RESOLVED: 'var(--success)',
    CANCELED: 'var(--text-secondary)',
  };

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Match Management</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['ALL', 'DISPUTED', 'SUBMITTED', 'IN_PROGRESS', 'SETTLED'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px' }}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Game</th>
                <th>Status</th>
                <th>Creator</th>
                <th>Accepter</th>
                <th>Stake</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {m.id.slice(0, 8)}...
                  </td>
                  <td>{m.game}</td>
                  <td>
                    <span
                      style={{
                        color: statusColors[m.status] || 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'lowercase',
                      }}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td>@{m.creator.handle}</td>
                  <td>{m.accepter ? `@${m.accepter.handle}` : '-'}</td>
                  <td>${(m.stakeCents / 100).toFixed(0)}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <Link
                      href={`/matches/${m.id}`}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px' }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button onClick={loadMatches} className="btn btn-secondary">
            Load more
          </button>
        </div>
      )}
    </Layout>
  );
}
