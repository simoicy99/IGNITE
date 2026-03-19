import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { adminApi } from '../lib/api';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setIsLoading(true);
    try {
      const res = await adminApi.getUsers({ search: search || undefined });
      setUsers(res.data.items);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers();
  };

  return (
    <Layout>
      <div className="page-header">
        <h1 className="page-title">Users</h1>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by handle or email..."
          style={{ maxWidth: '320px' }}
        />
        <button type="submit" className="btn btn-secondary">Search</button>
      </form>

      {isLoading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Handle</th>
                <th>Email</th>
                <th>State</th>
                <th>Matches</th>
                <th>Admin</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>@{u.handle}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td>{u.lastGeoState ?? '—'}</td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {u._count.matchesCreated + u._count.matchesAccepted} total
                    </span>
                  </td>
                  <td>
                    {u.isAdmin && (
                      <span className="badge" style={{ background: '#FFD70022', color: '#FFD700', border: '1px solid #FFD70044' }}>
                        Admin
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {new Date(u.createdAt).toLocaleDateString()}
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
