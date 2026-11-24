import React, { useState } from 'react';
import { Loader2, PlugZap, Search } from 'lucide-react';
import type { NavView } from '../types';

interface TopbarProps {
  activeView: NavView;
  changeCount: number;
  openCount: number;
  totalRecords: number;
  dayCount: number;
  isDataConnected: boolean;
  isAsking: boolean;
  onAskSubmit: (question: string) => void;
  onOpenConnect: () => void;
}

const VIEW_TITLES: Record<NavView, { title: string; subtitle: string }> = {
  dashboard: { title: 'DASHBOARD', subtitle: 'LIVING PERSONAL ROOT GRAPH' },
  investigations: { title: 'INVESTIGATIONS', subtitle: 'ACTIVE BRANCH WORKSPACE' },
  insights: { title: 'INSIGHTS', subtitle: 'MULTI-SIGNAL CHARTS & PROVENANCE' },
  history: { title: 'HISTORY', subtitle: 'TIMELINE REPLAY · ARROW KEYS ← →' },
  profile: { title: 'PROFILE', subtitle: 'CONNECTED ACCOUNTS & THEMES' },
  privacy: { title: 'PRIVACY & SETTINGS', subtitle: 'DATA POLICY · PII GATE · FAQS' },
  connect: { title: 'DATA & HELP', subtitle: 'UPLOAD COVERAGE · SOURCES · GUIDES' },
};

export const Topbar: React.FC<TopbarProps> = ({
  activeView,
  changeCount,
  openCount,
  totalRecords,
  dayCount,
  isDataConnected,
  isAsking,
  onAskSubmit,
  onOpenConnect,
}) => {
  const [question, setQuestion] = useState('');
  const meta = VIEW_TITLES[activeView];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim() || 'Why do I keep getting headaches?';
    onAskSubmit(q);
  };

  return (
    <header
      className="h-[54px] px-5 flex items-center justify-between gap-4 shrink-0 z-10"
      style={{
        backgroundColor: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="leading-tight shrink-0">
        <div className="font-mono text-[11px] font-semibold tracking-[0.16em] text-t1 whitespace-nowrap">
          {meta.title}
        </div>
        <div className="font-mono text-[8.5px] tracking-[0.12em] text-t3 whitespace-nowrap">
          {meta.subtitle}
        </div>
      </div>

      {/* Single-line status pills */}
      <div className="hidden lg:flex items-center gap-2">
        {[
          `${totalRecords.toLocaleString()} observations · ${dayCount} days`,
          `${changeCount} change event${changeCount === 1 ? '' : 's'}`,
          `${openCount} active branch${openCount === 1 ? '' : 'es'}`,
        ].map((chip) => (
          <span
            key={chip}
            className="px-3 py-1 rounded-full font-mono text-[10.5px] text-t3 whitespace-nowrap"
            style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <form onSubmit={handleSubmit} className="relative">
          <div
            className="flex items-center gap-2 px-3 h-8 w-[210px] sm:w-[250px] rounded-lg"
            style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border-strong)' }}
          >
            {isAsking ? (
              <Loader2 className="w-3.5 h-3.5 text-branchOpen animate-spin shrink-0" />
            ) : (
              <Search className="w-3.5 h-3.5 text-t3 shrink-0" />
            )}
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your health..."
              className="w-full bg-transparent text-[12.5px] text-t1 placeholder:text-t3 focus:outline-none"
            />
          </div>
        </form>

        {/* Smart Connection Status Button: reflects real connected state! */}
        <button
          type="button"
          onClick={onOpenConnect}
          title={
            isDataConnected
              ? 'Apple Health XML + Manual logs synced — click to manage or upload more'
              : 'Import Apple Health XML, Health Connect ZIP, CSV, or connect Google Health'
          }
          className="inline-flex items-center gap-2 px-3.5 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 whitespace-nowrap shrink-0"
          style={
            isDataConnected
              ? {
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.42)',
                  color: 'var(--ok)',
                }
              : {
                  backgroundColor: 'var(--s1)',
                  border: '1px solid var(--trunk)',
                  color: 'var(--t1)',
                }
          }
        >
          {isDataConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-ok" />
              </span>
              <span>Connected</span>
              <span className="font-mono text-[10px] opacity-80">· {totalRecords}</span>
            </>
          ) : (
            <>
              <PlugZap className="w-3.5 h-3.5 text-branchOpen" />
              <span>Connect data</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
