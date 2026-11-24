import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  data_source: string | null;
  is_demo: boolean;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  password: string;
  data_source?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  loginDemo: () => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
      return String(data.detail[0].msg);
    }
  } catch {
    // Non-JSON error body
  }
  return fallback;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const data = await res.json();
      const nextUser = (data?.user ?? null) as AuthUser | null;
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Invalid email or password.');
      throw new Error(msg);
    }
    const data = await res.json();
    const authedUser = data.user as AuthUser;
    setUser(authedUser);
    return authedUser;
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<AuthUser> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Could not create account.');
      throw new Error(msg);
    }
    const data = await res.json();
    const authedUser = data.user as AuthUser;
    setUser(authedUser);
    return authedUser;
  }, []);

  const loginDemo = useCallback(async (): Promise<AuthUser> => {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const msg = await parseErrorMessage(res, 'Could not start demo session. Ensure the backend is running.');
      throw new Error(msg);
    }
    const data = await res.json();
    const demoUser = data.user as AuthUser;
    setUser(demoUser);
    return demoUser;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginDemo, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
