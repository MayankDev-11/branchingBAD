import React, { useState } from 'react';

interface PreviewNode {
  id: string;
  shortLabel: string;
  layerLabel: string;
  x: number;
  y: number;
  isSignal?: boolean;
  timestamp: string;
  source: string;
  rule: string;
  summary: string;
}

const PREVIEW_NODES: PreviewNode[] = [
  {
    id: 'OBS-412',
    shortLabel: 'Wearable Signal',
    layerLabel: 'Layer 01 · Raw Signal',
    x: 92,
    y: 78,
    timestamp: '2026-11-03 06:48 IST',
    source: 'wearable_export.csv (SHA-256 verified)',
    rule: '30-day rolling median baseline = 64 ms HRV',
    summary: 'Overnight HRV & sleep stages ingested locally with zero cloud sync.',
  },
  {
    id: 'HAB-089',
    shortLabel: 'Habit Observation',
    layerLabel: 'Layer 01 · Daily Log',
    x: 92,
    y: 204,
    timestamp: '2026-11-02 16:35 IST',
    source: 'local_habit_log.sqlite',
    rule: 'Logged tag: caffeine > 120 mg after 14:00',
    summary: 'Structured daily habit tag linked by date without duplicating raw rows.',
  },
  {
    id: 'CHG-104',
    shortLabel: 'Change-Point (-14%)',
    layerLabel: 'Layer 02 · Deterministic',
    x: 278,
    y: 78,
    isSignal: true,
    timestamp: '2026-11-03 · 6d window',
    source: 'Python CUSUM + PELT detector',
    rule: '5 of 6 nights > 2 MAD below personal median (p = 0.004)',
    summary: 'Resting HRV dropped -14% against your personal baseline.',
  },
  {
    id: 'HYP-021',
    shortLabel: 'Hypothesis: Caffeine',
    layerLabel: 'Layer 02 · Hypothesis',
    x: 278,
    y: 204,
    timestamp: '2026-11-05 09:12 IST',
    source: 'Competing hypothesis matrix (Rank #1)',
    rule: 'Co-occurred on 5 of 6 low-HRV nights; 1 counterexample kept',
    summary: 'Post-2 PM caffeine delays cardiac recovery and suppresses overnight HRV.',
  },
  {
    id: 'EXP-004',
    shortLabel: 'N=1 Experiment',
    layerLabel: 'Layer 03 · Locked Trial',
    x: 468,
    y: 94,
    timestamp: '2026-11-06 -> 2026-11-20',
    source: 'SQLite locked_criterion trigger',
    rule: 'Locked target: HRV recovers >= +10% across >= 75% adherent days',
    summary: '14-day caffeine cutoff pre-registered before start; evaluated by Python.',
  },
  {
    id: 'AGN-009',
    shortLabel: 'Read-Only Agent Note',
    layerLabel: 'Layer 03 · Cited Synthesis',
    x: 468,
    y: 214,
    timestamp: '2026-11-20 08:05 IST',
    source: 'Read-only collaborator (writes blocked)',
    rule: 'Mandatory citation check passed: [OBS-412, CHG-104, EXP-004]',
    summary: 'Plain-language synthesis strictly bounded to verified record IDs.',
  },
];

const PREVIEW_EDGES: Array<{ from: string; to: string; signal?: boolean; dashed?: boolean }> = [
  { from: 'OBS-412', to: 'CHG-104', signal: true },
  { from: 'HAB-089', to: 'HYP-021' },
  { from: 'CHG-104', to: 'HYP-021', signal: true },
  { from: 'CHG-104', to: 'EXP-004' },
  { from: 'HYP-021', to: 'EXP-004' },
  { from: 'EXP-004', to: 'AGN-009', dashed: true },
  { from: 'HYP-021', to: 'AGN-009', dashed: true },
];

export const EvidenceGraphPreview: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('CHG-104');
  const selected = PREVIEW_NODES.find((n) => n.id === selectedId) ?? PREVIEW_NODES[2];

  const byId = Object.fromEntries(PREVIEW_NODES.map((n) => [n.id, n]));

  return (
    <div className="rl-card overflow-hidden shadow-[0_2px_12px_rgba(21,24,23,0.04)]">
      {/* Header strip */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-2 border-b"
        style={{ backgroundColor: 'var(--rl-bg-subtle)', borderColor: 'var(--rl-border-hairline)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--rl-accent-primary)' }}
          />
          <span className="rl-mono text-[11px] font-medium" style={{ color: 'var(--rl-ink-primary)' }}>
            EVIDENCE GRAPH PREVIEW
          </span>
        </div>
        <span className="rl-mono text-[10.5px]" style={{ color: 'var(--rl-ink-muted)' }}>
          Select any node to inspect receipt
        </span>
      </div>

      {/* Interactive SVG Graph */}
      <div className="relative rl-dot-grid px-3 py-4" style={{ backgroundColor: 'var(--rl-bg-surface)' }}>
        <div className="grid grid-cols-3 text-center mb-1.5 px-2">
          <span className="rl-mono text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
            01 · Signals
          </span>
          <span className="rl-mono text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
            02 · Detection
          </span>
          <span className="rl-mono text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
            03 · Verification
          </span>
        </div>

        <svg
          viewBox="0 0 560 280"
          className="w-full h-auto block"
          role="img"
          aria-label="Interactive RootTrace evidence graph showing 6 nodes across signals, change-point detection, and experiments"
        >
          {/* Smooth Bezier edges */}
          {PREVIEW_EDGES.map((edge) => {
            const a = byId[edge.from];
            const b = byId[edge.to];
            const isConnected = selectedId === edge.from || selectedId === edge.to;
            const dx = b.x - a.x;
            const d =
              Math.abs(dx) < 20
                ? `M ${a.x} ${a.y} L ${b.x} ${b.y}`
                : `M ${a.x} ${a.y} C ${a.x + dx * 0.5} ${a.y}, ${b.x - dx * 0.5} ${b.y}, ${b.x} ${b.y}`;
            const stroke = edge.signal
              ? 'var(--rl-accent-signal)'
              : isConnected
              ? 'var(--rl-accent-primary)'
              : '#C9C5BC';

            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={isConnected ? 2.1 : 1.35}
                strokeDasharray={edge.dashed ? '4 4' : undefined}
                strokeOpacity={isConnected ? 1 : 0.72}
                className="rl-transition"
              />
            );
          })}

          {/* 6 Interactive Nodes */}
          {PREVIEW_NODES.map((node) => {
            const active = node.id === selectedId;
            const accent = node.isSignal ? 'var(--rl-accent-signal)' : 'var(--rl-accent-primary)';
            const w = 148;
            const h = 50;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x - w / 2}, ${node.y - h / 2})`}
                onClick={() => setSelectedId(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(node.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={active}
                aria-label={`${node.shortLabel} (${node.id})`}
                className="cursor-pointer focus:outline-none"
              >
                <rect
                  x="0"
                  y="0"
                  width={w}
                  height={h}
                  rx="10"
                  fill={active ? (node.isSignal ? '#FDF6EE' : '#F0F6F4') : '#FFFFFF'}
                  stroke={active ? accent : '#D9D5CC'}
                  strokeWidth={active ? 1.8 : 1.1}
                  className="rl-transition"
                />
                <circle cx="14" cy="17" r="3.5" fill={accent} />
                <text
                  x="24"
                  y="20.5"
                  fontSize="9.5"
                  fontWeight="600"
                  fill={accent}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.id}
                </text>
                <text
                  x="11"
                  y="38"
                  fontSize="11.5"
                  fontWeight="600"
                  fill="#151817"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  {node.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Crisp Monospace Inspector Bar */}
      <div
        className="px-4 py-3.5 border-t space-y-2.5"
        style={{ backgroundColor: 'var(--rl-bg-subtle)', borderColor: 'var(--rl-border-hairline)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="rl-mono text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: selected.isSignal ? 'rgba(199, 119, 36, 0.14)' : 'rgba(42, 87, 75, 0.12)',
                color: selected.isSignal ? 'var(--rl-accent-signal)' : 'var(--rl-accent-primary)',
              }}
            >
              {selected.id}
            </span>
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--rl-ink-primary)' }}>
              {selected.shortLabel}
            </span>
          </div>
          <span className="rl-mono text-[10.5px]" style={{ color: 'var(--rl-ink-muted)' }}>
            {selected.timestamp}
          </span>
        </div>

        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--rl-ink-secondary)' }}>
          {selected.summary}
        </p>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t rl-mono text-[10.5px]"
          style={{ borderColor: 'var(--rl-border-hairline)' }}
        >
          <div>
            <span className="block text-[9.5px] uppercase" style={{ color: 'var(--rl-ink-muted)' }}>
              Source
            </span>
            <span style={{ color: 'var(--rl-ink-primary)' }}>{selected.source}</span>
          </div>
          <div>
            <span className="block text-[9.5px] uppercase" style={{ color: 'var(--rl-ink-muted)' }}>
              Deterministic Rule
            </span>
            <span style={{ color: 'var(--rl-ink-primary)' }}>{selected.rule}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
