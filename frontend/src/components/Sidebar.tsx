import React from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  HelpCircle,
  History,
  LayoutGrid,
  LineChart,
  LogOut,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { NavView } from '../types';

interface SidebarProps {
  collapsed: boolean;
  activeView: NavView;
  openCount: number;
  searchQuery: string;
  onToggleCollapse: () => void;
  onNavigate: (view: NavView) => void;
  onSearchChange: (val: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  activeView,
  openCount,
  searchQuery,
  onToggleCollapse,
  onNavigate,
  onSearchChange,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.full_name || 'RootTrace User')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const navItems: Array<{ id: NavView; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid className="w-4 h-4" /> },
    {
      id: 'investigations',
      label: 'Investigations',
      icon: <FlaskConical className="w-4 h-4" />,
      badge: openCount,
    },
    { id: 'insights', label: 'Insights', icon: <LineChart className="w-4 h-4" /> },
    { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  ];

  return (
    <aside
      className="relative flex flex-col justify-between h-screen shrink-0 transition-all duration-200 select-none z-20"
      style={{
        width: collapsed ? 68 : 224,
        backgroundColor: 'var(--s1)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Collapse handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label="Toggle sidebar"
        className="absolute -right-3 top-[66px] w-6 h-6 rounded-full flex items-center justify-center text-t2 hover:text-t1 transition-colors"
        style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border-strong)' }}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      <div>
        {/* Brand */}
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="w-full flex items-center gap-2.5 px-4 h-[52px] text-left"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--s2)',
              border: '1.5px solid var(--trunk)',
            }}
          >
            <Activity className="w-4 h-4 text-branchOpen" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-serif text-[18px] tracking-tight text-t1">RootTrace</div>
              <div className="font-mono text-[8px] tracking-[0.14em] uppercase text-t3">
                Personal Health Graph
              </div>
            </div>
          )}
        </button>

        {/* Search timeline */}
        {!collapsed && (
          <div className="px-3 mt-3">
            <div
              className="flex items-center gap-2 px-2.5 h-9 rounded-lg"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <Search className="w-3.5 h-3.5 text-t3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search timeline"
                className="w-full bg-transparent text-[12px] text-t1 placeholder:text-t3 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Workspace Navigation */}
        <div className="px-2.5 mt-5">
          {!collapsed && (
            <div className="px-2.5 mb-2 font-mono text-[9.5px] tracking-[0.12em] uppercase text-t3">
              Workspace
            </div>
          )}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className="relative flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all"
                  style={{
                    backgroundColor: active ? 'var(--s2)' : 'transparent',
                    color: active ? 'var(--branch-open)' : 'var(--t2)',
                    border: active ? '1px solid var(--border-strong)' : '1px solid transparent',
                  }}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                      style={{ backgroundColor: 'var(--branch-open)' }}
                    />
                  )}
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    {!collapsed && <span>{item.label}</span>}
                  </span>
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full font-mono text-[10px] font-semibold"
                      style={{
                        backgroundColor: 'rgba(20, 184, 166, 0.16)',
                        color: 'var(--branch-open)',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="my-4 border-t" style={{ borderColor: 'var(--border)' }} />

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onNavigate('privacy')}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-colors"
              style={{
                backgroundColor: activeView === 'privacy' ? 'var(--s2)' : 'transparent',
                color: activeView === 'privacy' ? 'var(--branch-open)' : 'var(--t3)',
              }}
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Privacy &amp; settings</span>}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('connect')}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] text-t3 hover:text-t2 transition-colors"
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Data &amp; help</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Profile Card */}
      <div className="p-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="w-full flex items-center justify-between gap-2 p-2 rounded-xl transition-colors hover:opacity-95"
          style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0"
              style={{
                backgroundColor: 'rgba(20, 184, 166, 0.18)',
                color: 'var(--branch-open)',
                border: '1px solid var(--border-strong)',
              }}
            >
              {initials}
            </div>
            {!collapsed && (
              <div className="text-left min-w-0">
                <div className="text-[12px] font-semibold text-t1 truncate">
                  {user?.full_name || 'Your profile'}
                </div>
                <div className="font-mono text-[9px] text-ok truncate">DATA SYNCED · NOW</div>
              </div>
            )}
          </div>
          {!collapsed && <ShieldCheck className="w-4 h-4 text-branchOpen shrink-0" />}
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-2 w-full px-2 py-1.5 rounded-lg flex items-center gap-2 text-[11.5px] text-t3 hover:text-t1 hover:bg-s2 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign Out{user?.is_demo ? ' (Demo)' : ''}</span>}
        </button>
      </div>
    </aside>
  );
};
