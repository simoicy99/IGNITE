import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem('auth_token');
    }
    return await SecureStore.getItemAsync('auth_token');
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem('auth_token', token);
    return;
  }
  await SecureStore.setItemAsync('auth_token', token);
}

export async function removeToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem('auth_token');
    return;
  }
  await SecureStore.deleteItemAsync('auth_token');
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? 'Request failed', res.status, data);
  }

  return data;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: {
    email: string;
    handle: string;
    password: string;
    geo: { latitude: number; longitude: number; state: string };
  }) => apiRequest('/auth/register', { method: 'POST', body: data }),

  login: (data: { email: string; password: string }) =>
    apiRequest('/auth/login', { method: 'POST', body: data }),

  me: () => apiRequest('/auth/me'),

  updateProfile: (data: { chessUsername?: string; psnTag?: string; xboxTag?: string }) =>
    apiRequest('/auth/profile', { method: 'PATCH', body: data }),

  updateHandle: (handle: string) =>
    apiRequest('/auth/handle', { method: 'PATCH', body: { handle } }),
};

// ─── Feed API ────────────────────────────────────────────────────────────────

export const feedApi = {
  getFeed: (params?: { cursor?: string; limit?: number; type?: string }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.type) query.set('type', params.type);
    return apiRequest(`/feed?${query.toString()}`);
  },

  createChallenge: (data: {
    game: string;
    templateId: string;
    stakeCents: number;
    platform?: string;
    body?: string;
    geo: { latitude: number; longitude: number; state: string };
  }) => apiRequest('/feed/challenge', { method: 'POST', body: data }),

  createSocial: (data: { body: string; mediaUrl?: string }) =>
    apiRequest('/feed/social', { method: 'POST', body: data }),

  getPost: (postId: string) => apiRequest(`/feed/${postId}`),

  getComments: (postId: string, params?: { cursor?: string }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    return apiRequest(`/feed/${postId}/comments?${query.toString()}`);
  },

  addComment: (postId: string, body: string) =>
    apiRequest(`/feed/${postId}/comments`, { method: 'POST', body: { body } }),
};

// ─── Wallet API ──────────────────────────────────────────────────────────────

export const walletApi = {
  getBalance: () => apiRequest('/wallet'),

  topUp: (data: {
    amountCents: number;
    geo: { latitude: number; longitude: number; state: string };
  }) => apiRequest('/wallet/topup', { method: 'POST', body: data }),

  withdraw: (data: {
    amountCents: number;
    geo: { latitude: number; longitude: number; state: string };
    payoutMethod: { type: string; accountId?: string };
  }) => apiRequest('/wallet/withdraw', { method: 'POST', body: data }),

  getTransactions: (params?: { cursor?: string }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    return apiRequest(`/wallet/transactions?${query.toString()}`);
  },
};

// ─── Matches API ─────────────────────────────────────────────────────────────

export const matchesApi = {
  getMatches: (params?: { game?: string; cursor?: string }) => {
    const query = new URLSearchParams();
    if (params?.game) query.set('game', params.game);
    if (params?.cursor) query.set('cursor', params.cursor);
    return apiRequest(`/matches?${query.toString()}`);
  },

  getMatch: (id: string) => apiRequest(`/matches/${id}`),

  getTemplates: () => apiRequest('/matches/templates'),

  accept: (matchId: string, geo: { latitude: number; longitude: number; state: string }) =>
    apiRequest(`/matches/${matchId}/accept`, { method: 'POST', body: { geo } }),

  cancel: (matchId: string) =>
    apiRequest(`/matches/${matchId}/cancel`, { method: 'POST' }),

  // Chess
  submitChessLink: (matchId: string, chessLink: string) =>
    apiRequest(`/matches/${matchId}/chess-link`, { method: 'POST', body: { chessLink } }),

  submitChessResult: (matchId: string, result: 'I_WON' | 'I_LOST') =>
    apiRequest(`/matches/${matchId}/chess-result`, { method: 'POST', body: { result } }),

  // NBA 2K
  submitNba2kResult: (
    matchId: string,
    data: { result: 'I_WON' | 'I_LOST'; myScore: number; opponentScore: number; proofUrl: string }
  ) => apiRequest(`/matches/${matchId}/nba2k-submit`, { method: 'POST', body: data }),

  confirmNba2kResult: (matchId: string) =>
    apiRequest(`/matches/${matchId}/nba2k-confirm`, { method: 'POST' }),

  disputeNba2kResult: (matchId: string, reason: string) =>
    apiRequest(`/matches/${matchId}/nba2k-dispute`, { method: 'POST', body: { reason } }),
};

// ─── Disputes API ────────────────────────────────────────────────────────────

export const disputesApi = {
  getMyDisputes: () => apiRequest('/disputes'),
  getDispute: (id: string) => apiRequest(`/disputes/${id}`),
  openDispute: (matchId: string, reason: string) =>
    apiRequest(`/disputes/match/${matchId}`, { method: 'POST', body: { reason } }),
};
