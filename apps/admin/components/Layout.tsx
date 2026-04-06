import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getAuthToken, clearAuthToken, adminApi } from '../lib/api';

function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ignite-theme') : null;
    const isDark = saved ? saved === 'dark' : true;
    setDark(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('ignite-theme', next ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
  };

  return (
    <button className="theme-toggle" onClick={toggle} title={dark ? 'Switch to light' : 'Switch to dark'}>
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

const NAV = [
  { href: '/',            label: 'Dashboard',  icon: '📊' },
  { href: '/matches',     label: 'Matches',    icon: '🎮' },
  { href: '/disputes',    label: 'Disputes',   icon: '⚖️',  statKey: 'openDisputes' },
  { href: '/withdrawals', label: 'Withdrawals',icon: '💸',  statKey: 'pendingWithdrawals' },
  { href: '/users',       label: 'Users',      icon: '👥' },
  { href: '/allowlist',   label: 'Allowlist',  icon: '✉️' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token && router.pathname !== '/login') {
      router.push('/login');
      return;
    }
    if (token) {
      adminApi.getStats().then(r => setStats(r?.data)).catch(() => {});
    }
  }, [router.pathname]);

  if (router.pathname === '/login') return <>{children}</>;

  return (
    <div className="layout">
      {/* Mobile top bar */}
      <header className="mobile-header">
        <button
          onClick={() => setMobileOpen(o => !o)}
          style={{ background: 'none', border: 'none', fontSize: 22, color: 'rgba(255,255,255,0.7)', padding: 4 }}
        >
          ☰
        </button>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>🔥 IGNITE</span>
        <ThemeToggle />
      </header>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99 }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${mobileOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-wrap">
            <div className="logo-flame">🔥</div>
            <div className="logo-text">
              <h1>IGNITE</h1>
              <p>Admin Console</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => {
            const badge = item.statKey && stats ? stats[item.statKey] : null;
            const active = router.pathname === item.href ||
              (item.href !== '/' && router.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${active ? ' active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <ThemeToggle />
          <button
            className="logout-btn"
            onClick={() => { clearAuthToken(); router.push('/login'); }}
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content" id="main-content">
        {children}
      </main>
    </div>
  );
}
