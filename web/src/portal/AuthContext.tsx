import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Account } from './api';

type AuthContextValue = {
  account: Account | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<Account>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ account: Account }>('/auth/me')
      .then((res) => setAccount(res.account))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await api.post<{ account: Account }>('/auth/login', { email, password });
      setAccount(res.account);
      return res.account;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setAccount(null);
  }, []);

  return (
    <AuthContext.Provider value={{ account, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
