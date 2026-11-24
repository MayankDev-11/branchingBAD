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

// The landing page is public (no sign-in), so it can't call the API. These nodes copy the
// demo's real records and results (seed 42, demo clock 20 Nov): the IDs, values and counts
// are exactly what the dashboard shows after "Judge Demo".
const PREVIEW_NODES: PreviewNode[] = [
  {
    id: 'sl_0071',
    shortLabel: 'Sleep: 5h 52m',
    layerLabel: 'Layer 01 · Raw Signal',
    x: 92,
    y: 78,
    timestamp: '2026-11-03 06:48 IST',
    source: 'apple_health_export.xml · iPhone 15 Pro',
    rule: 'Stored as 352 minutes; observations are never edited',
    summary: 'Night ending 3 Nov, imported from the Apple Health export and kept unchanged.',
  },
  {
    id: 'hd_0071',
    shortLabel: 'Headache logged',
    layerLabel: 'Layer 01 · Daily Log',
    x: 92,
    y: 204,
    timestamp: '2026-11-03 15:20 IST',
    source: 'manual_checkins.sqlite',
    rule: 'Symptom check-in stored as a yes/no flag',
    summary: 'A headache reported the afternoon after a short night.',
  },
  {
    id: 'ce_1',
    shortLabel: 'Sleep down 47 min',
    layerLabel: 'Layer 02 · Deterministic',
    x: 278,
    y: 78,
    isSignal: true,
    timestamp: 'From 2026-11-03',
    source: 'Python: ruptures PELT + 30-day median/MAD rule',
    rule: 'Normal 7h 06m before 3 Nov; 6h 19m over the next 10 days',
    summary: 'Sleep shifted 47 minutes below your own 30-day normal and stayed there.',
  },
  {
    id: 'Hyp #1',
    shortLabel: 'Short sleep · 60%',
    layerLabel: 'Layer 02 · Hypothesis',
    x: 278,
    y: 204,
    timestamp: 'Opened 2026-11-07',
    source: 'Pattern finder: 3 competing explanations, ranked',
    rule: '4 of 5 headache days followed nights under 6 h; 1 of 5 other days did too',
    summary: 'Ranked first of three explanations. The counterexample is kept, not hidden.',
  },
  {
    id: 'exp_1',
    shortLabel: 'Lights out 11:30 PM',
    layerLabel: 'Layer 03 · Locked Trial',
    x: 468,
    y: 94,
    timestamp: '2026-11-13 → 2026-11-22',
    source: 'SQLite lock_criterion trigger (locked 12 Nov)',
    rule: 'Sleep must exceed 7 hours on at least 7 of 10 nights',
    summary: 'The success rule was locked before night 1; Python decides the result.',
  },
  {
    id: 'AI note',
    shortLabel: 'Read-only AI summary',
    layerLabel: 'Layer 03 · Cited Synthesis',
    x: 468,
    y: 214,
    timestamp: 'On request',
    source: 'Claude Haiku 4.5 on Bedrock, read-only tools',
    rule: 'Every claim must cite real record IDs, e.g. [sl_0071, hd_0071]',
    summary: 'Explains the verified counts in plain language; uncited claims are dropped.',
  },
];

const PREVIEW_EDGES: Array<{ from: string; to: string; signal?: boolean; dashed?: boolean }> = [
  { from: 'sl_0071', to: 'ce_1', signal: true },
  { from: 'hd_0071', to: 'Hyp #1' },
  { from: 'ce_1', to: 'Hyp #1', signal: true },
  { from: 'ce_1', to: 'exp_1' },
  { from: 'Hyp #1', to: 'exp_1' },
  { from: 'exp_1', to: 'AI note', dashed: true },
  { from: 'Hyp #1', to: 'AI note', dashed: true },
];

export const EvidenceGraphPreview: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('ce_1');
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
          aria-label="Interactive RootTrace evidence graph: a sleep record and a headache log, the 3 Nov sleep drop, the top hypothesis, the locked experiment and the AI summary"
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
