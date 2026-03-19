import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getAuthToken, clearAuthToken, adminApi } from '../lib/api';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token && router.pathname !== '/login') {
      router.push('/login');
    } else if (token) {
      adminApi.getStats().then(setStats).catch(() => {});
    }
  }, [router.pathname]);

  const handleLogout = () => {
    clearAuthToken();
    router.push('/login');
  };

  if (router.pathname === '/login') {
    return <>{children}</>;
  }

  const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/disputes', label: 'Disputes', icon: '⚖️', badge: stats?.data?.openDisputes },
    { href: '/withdrawals', label: 'Withdrawals', icon: '💸', badge: stats?.data?.pendingWithdrawals },
    { href: '/users', label: 'Users', icon: '👥' },
    { href: '/allowlist', label: 'Allowlist', icon: '✉️' },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>IGNITE</h1>
          <p>Admin Console</p>
        </div>

        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${router.pathname === item.href ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? (
                <span style={{
                  background: '#FF4D4D',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
