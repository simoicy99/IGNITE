import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi } from '../lib/api';
import Link from 'next/link';
import { Card, StatCard, Badge, Button, Loading, EmptyState } from '../components/ui';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30_000);
    return () => clearInterval(t);
  }, []);

  async function loadData() {
    try {
      const [sRes, dRes, wRes] = await Promise.all([
        adminApi.getStats(),
        adminApi.getDisputes({ status: 'OPEN' }),
        adminApi.getWithdrawals('PENDING'),
      ]);
      setStats(sRes?.data);
      setDisputes((dRes?.data?.items || []).slice(0, 5));
      setWithdrawals((wRes?.data || []).slice(0, 5));
    } catch {}
    finally { setIsLoading(false); }
  }

  if (isLoading) return <Layout><Loading text="Loading dashboard…" /></Layout>;

  return (
    <Layout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadData}>🔄 Refresh</Button>
      </div>

      {/* Stats — 5 columns */}
      <div className="stat-grid">
        <StatCard label="Total Users"          value={stats?.totalUsers        ?? 0} icon="👥" />
        <StatCard label="Total Matches"        value={stats?.totalMatches      ?? 0} icon="🎮" />
        <StatCard label="Active Matches"       value={stats?.activeMatches     ?? 0} icon="⚡"  change="In progress" />
        <StatCard label="Open Disputes"        value={stats?.openDisputes      ?? 0} icon="⚠️"
          change={stats?.openDisputes > 0 ? 'Needs attention' : 'All clear'}
          changeType={stats?.openDisputes > 0 ? 'negative' : 'positive'} />
        <StatCard label="Pending Withdrawals"  value={stats?.pendingWithdrawals ?? 0} icon="💰" change="Awaiting approval" />
      </div>

      {/* Two column cards */}
      <div className="grid grid-2 gap-6">
        {/* Open Disputes */}
        <Card
          title="Open Disputes"
          actions={<Link href="/disputes"><Button variant="ghost" size="sm">View all →</Button></Link>}
        >
          {disputes.length === 0 ? (
            <EmptyState title="No open disputes" description="All disputes have been resolved" />
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>Match</th><th>Game</th><th>Stake</th><th>Date</th><th /></tr></thead>
                <tbody>
                  {disputes.map(d => (
                    <tr key={d.id}>
                      <td><span className="font-mono" style={{ fontSize: 12 }}>{d.matchId?.slice(0,8)}…</span></td>
                      <td>{d.match?.game}</td>
                      <td><span className="text-success font-bold">${((d.match?.stakeCents ?? 0) * 2 / 100).toFixed(0)}</span></td>
                      <td><span className="text-muted">{new Date(d.createdAt).toLocaleDateString()}</span></td>
                      <td><Link href={`/disputes/${d.id}`}><Button variant="secondary" size="sm">Review</Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Pending Withdrawals */}
        <Card
          title="Pending Withdrawals"
          actions={<Link href="/withdrawals"><Button variant="ghost" size="sm">View all →</Button></Link>}
        >
          {withdrawals.length === 0 ? (
            <EmptyState title="No pending withdrawals" description="All withdrawals processed" />
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>User</th><th>Amount</th><th>Date</th><th /></tr></thead>
                <tbody>
                  {withdrawals.map(w => (
                    <tr key={w.id}>
                      <td><span className="font-medium">@{w.user?.handle}</span></td>
                      <td><span className="text-success font-bold">${(w.amountCents / 100).toFixed(2)}</span></td>
                      <td><span className="text-muted">{new Date(w.createdAt).toLocaleDateString()}</span></td>
                      <td><Link href="/withdrawals"><Button variant="secondary" size="sm">Process</Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="card mt-6">
        <div className="card-header">
          <h3 className="card-title">Quick Actions</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/matches"><Button variant="secondary">🎮 View Matches</Button></Link>
          <Link href="/users"><Button variant="secondary">👥 Manage Users</Button></Link>
          <Link href="/allowlist"><Button variant="secondary">✉️ Allowlist</Button></Link>
        </div>
      </div>
    </Layout>
  );
}
