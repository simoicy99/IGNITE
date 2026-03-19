import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi } from '../lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsRes, disputesRes, withdrawalsRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.getDisputes({ status: 'OPEN' }),
        adminApi.getWithdrawals('PENDING'),
      ]);
      setStats(statsRes.data);
      setDisputes(disputesRes.data.items.slice(0, 5));
      setWithdrawals(withdrawalsRes.data.slice(0, 5));
    } catch (err) {
      // Redirect to login if unauthorized
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{stats?.totalUsers ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Matches</div>
          <div className="stat-value">{stats?.totalMatches ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Matches</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats?.activeMatches ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open Disputes</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats?.openDisputes ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Withdrawals</div>
          <div className="stat-value" style={{ color: 'var(--info)' }}>{stats?.pendingWithdrawals ?? 0}</div>
        </div>
      </div>

      {/* Open Disputes */}
      <div style={{ marginBottom: '24px' }}>
        <div className="page-header" style={{ marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Open Disputes</h2>
          <Link href="/disputes" style={{ color: 'var(--accent)', fontSize: '13px' }}>
            View all →
          </Link>
        </div>

        {disputes.length === 0 ? (
          <div className="card" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
            No open disputes
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Game</th>
                  <th>Stakes</th>
                  <th>Opened By</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{d.matchId.slice(0, 8)}...</td>
                    <td>{d.match.game}</td>
                    <td>${(d.match.stakeCents * 2 / 100).toFixed(0)} pot</td>
                    <td>@{d.match.creator.handle}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link href={`/disputes/${d.id}`} className="btn btn-secondary" style={{ fontSize: '12px' }}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Withdrawals */}
      <div>
        <div className="page-header" style={{ marginBottom: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Pending Withdrawals</h2>
          <Link href="/withdrawals" style={{ color: 'var(--accent)', fontSize: '13px' }}>
            View all →
          </Link>
        </div>

        {withdrawals.length === 0 ? (
          <div className="card" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>
            No pending withdrawals
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Requested</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>@{w.user.handle}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>
                      ${(w.amountCents / 100).toFixed(2)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(w.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link href="/withdrawals" className="btn btn-secondary" style={{ fontSize: '12px' }}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
