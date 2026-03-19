import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi } from '../lib/api';

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadWithdrawals();
  }, [statusFilter]);

  async function loadWithdrawals() {
    setIsLoading(true);
    try {
      const res = await adminApi.getWithdrawals(statusFilter !== 'ALL' ? statusFilter : undefined);
      setWithdrawals(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await adminApi.approveWithdrawal(id);
      await loadWithdrawals();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    if (!confirm('Reject this withdrawal? Funds will be returned to the user.')) return;
    setActionLoading(id);
    try {
      await adminApi.rejectWithdrawal(id);
      await loadWithdrawals();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Withdrawals</h1>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((s) => (
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
      ) : withdrawals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No {statusFilter.toLowerCase()} withdrawals
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>@{w.user.handle}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{w.user.email}</div>
                  </td>
                  <td style={{ color: 'var(--success)', fontWeight: 700, fontSize: '16px' }}>
                    ${(w.amountCents / 100).toFixed(2)}
                  </td>
                  <td>
                    <span className={`badge badge-${w.status.toLowerCase()}`}>
                      {w.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {new Date(w.createdAt).toLocaleString()}
                  </td>
                  <td>
                    {w.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-success"
                          onClick={() => handleApprove(w.id)}
                          disabled={actionLoading === w.id}
                          style={{ fontSize: '12px' }}
                        >
                          {actionLoading === w.id ? '...' : '✓ Approve'}
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleReject(w.id)}
                          disabled={actionLoading === w.id}
                          style={{ fontSize: '12px' }}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
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
