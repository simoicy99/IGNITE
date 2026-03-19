import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { adminApi } from '../../lib/api';
import Link from 'next/link';

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDisputes();
  }, [statusFilter]);

  async function loadDisputes() {
    setIsLoading(true);
    try {
      const res = await adminApi.getDisputes({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setDisputes(res.data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Disputes</h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['OPEN', 'RESOLVED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : disputes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No {statusFilter.toLowerCase()} disputes
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Dispute ID</th>
                <th>Game</th>
                <th>Players</th>
                <th>Pot</th>
                <th>Bond</th>
                <th>Status</th>
                <th>Decision</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {d.id.slice(0, 8)}...
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{d.match.game}</span>
                    {d.match.platform && <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>({d.match.platform})</span>}
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    @{d.match.creator.handle} vs @{d.match.accepter?.handle ?? '?'}
                  </td>
                  <td style={{ color: 'var(--warning)' }}>
                    ${(d.match.stakeCents * 2 / 100).toFixed(0)}
                  </td>
                  <td style={{ color: 'var(--danger)' }}>
                    ${(d.bondCents / 100).toFixed(2)}
                  </td>
                  <td>
                    <span className={`badge badge-${d.status.toLowerCase()}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>
                    {d.decision ? (
                      <span className={`badge badge-${d.decision === 'UPHELD' ? 'resolved' : 'rejected'}`}>
                        {d.decision}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <Link
                      href={`/disputes/${d.id}`}
                      className={`btn ${d.status === 'OPEN' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '12px' }}
                    >
                      {d.status === 'OPEN' ? 'Resolve' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
