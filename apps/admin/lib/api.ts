const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('admin_token', token);
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('admin_token');
  }
  return null;
}

export function clearAuthToken() {
  authToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('admin_token');
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? 'Request failed', res.status);
  }

  return data;
}

// Admin API
export const adminApi = {
  login: (email: string, password: string) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getStats: () => apiFetch('/admin/stats'),

  getDisputes: (params?: { status?: string; cursor?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.cursor) q.set('cursor', params.cursor);
    return apiFetch(`/admin/disputes?${q.toString()}`);
  },

  getDispute: (id: string) => apiFetch(`/admin/disputes/${id}`),

  resolveDispute: (id: string, decision: 'UPHELD' | 'DENIED', reason: string) =>
    apiFetch(`/admin/disputes/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),

  getWithdrawals: (status?: string) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    return apiFetch(`/admin/withdrawals?${q.toString()}`);
  },

  approveWithdrawal: (id: string) =>
    apiFetch(`/admin/withdrawals/${id}/approve`, { method: 'POST' }),

  rejectWithdrawal: (id: string) =>
    apiFetch(`/admin/withdrawals/${id}/reject`, { method: 'POST' }),

  getUsers: (params?: { search?: string; cursor?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.cursor) q.set('cursor', params.cursor);
    return apiFetch(`/admin/users?${q.toString()}`);
  },

  addAllowlist: (email: string, note?: string) =>
    apiFetch('/admin/allowlist', {
      method: 'POST',
      body: JSON.stringify({ email, note }),
    }),
};
