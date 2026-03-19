import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, getToken, setToken, removeToken } from './api';

interface User {
  id: string;
  email: string;
  handle: string;
  isAdmin: boolean;
  chessUsername?: string;
  psnTag?: string;
  xboxTag?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const storedToken = await getToken();
      if (storedToken) {
        setTokenState(storedToken);
        const res = await authApi.me();
        setUser(res.data);
      }
    } catch (err) {
      // Token invalid or expired
      await removeToken();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const res = await authApi.login({ email, password });
    const { token: newToken, user: newUser } = res.data;
    await setToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
  }

  async function logout() {
    await removeToken();
    setTokenState(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const res = await authApi.me();
      setUser(res.data);
    } catch (err) {
      // Ignore
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
