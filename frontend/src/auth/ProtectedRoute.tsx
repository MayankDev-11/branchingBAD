import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import '../styles/roottrace-public.css';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="rl-scope flex items-center justify-center min-h-screen px-6">
        <div className="rl-card px-6 py-5 flex items-center gap-3.5 shadow-sm">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--rl-accent-primary)' }}
          />
          <div>
            <p className="rl-mono text-[12px] font-medium" style={{ color: 'var(--rl-ink-primary)' }}>
              VERIFYING LOCAL SESSION
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--rl-ink-muted)' }}>
              Checking HttpOnly session cookie against SQLite store...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/auth?mode=signin"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
};
