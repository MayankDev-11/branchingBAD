import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Droplets,
  Flame,
  Lock,
  Moon,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import type { BranchDetailResponse, GraphResponse } from '../types';

interface InsightsViewProps {
  graph: GraphResponse;
  branch: BranchDetailResponse | null;
  onOpenRecord: (id: string, tab?: 'raw' | 'ai') => void;
  onOpenGraphBranch: (branchId: string) => void;
}

// 21-day deterministic demo series illustrating the planted Nov 3 sleep drop, headaches, water & screen shifts
const SLEEP_SERIES = [
  { date: 'Oct 24', sleep: 438, water: 2.1, screen: 35, headache: false, rec: 'sl_0401' },
  { date: 'Oct 26', sleep: 425, water: 1.9, screen: 42, headache: false, rec: 'sl_0403' },
  { date: 'Oct 28', sleep: 441, water: 2.2, screen: 30, headache: false, rec: 'sl_0405' },
  { date: 'Oct 30', sleep: 416, water: 1.8, screen: 48, headache: false, rec: 'sl_0407' },
  { date: 'Nov 01', sleep: 432, water: 2.0, screen: 40, headache: false, rec: 'sl_0409' },
  { date: 'Nov 03', sleep: 315, water: 0.82, screen: 112, headache: true, rec: 'sl_0412', shift: true },
  { date: 'Nov 04', sleep: 298, water: 0.90, screen: 124, headache: true, rec: 'sl_0413' },
  { date: 'Nov 06', sleep: 356, water: 1.10, screen: 96, headache: false, rec: 'sl_0414' },
  { date: 'Nov 07', sleep: 334, water: 0.95, screen: 118, headache: true, rec: 'sl_0398' },
  { date: 'Nov 09', sleep: 445, water: 1.90, screen: 44, headache: true, rec: 'hd_0031', counterexample: true },
  { date: 'Nov 10', sleep: 342, water: 0.88, screen: 105, headache: true, rec: 'sl_0412' },
  { date: 'Nov 12', sleep: 382, water: 1.45, screen: 72, headache: false, rec: 'sl_0413' },
  { date: 'Nov 14', sleep: 410, water: 1.75, screen: 55, headache: false, rec: 'sl_0412' },
  { date: 'Nov 16', sleep: 426, water: 2.05, screen: 38, headache: false, rec: 'sl_0412' },
  { date: 'Nov 18', sleep: 434, water: 2.10, screen: 34, headache: false, rec: 'sl_0412' },
  { date: 'Nov 20', sleep: 429, water: 1.95, screen: 40, headache: false, rec: 'sl_0412' },
];

const EXPERIMENT_NIGHTS = [
  { night: 'N1', hrs: 6.4, hit: false },
  { night: 'N2', hrs: 7.2, hit: true },
  { night: 'N3', hrs: 7.4, hit: true },
  { night: 'N4', hrs: 7.1, hit: true },
  { night: 'N5', hrs: 6.5, hit: false },
  { night: 'N6', hrs: 7.3, hit: true },
  { night: 'N7', hrs: 7.5, hit: true },
  { night: 'N8', hrs: 7.2, hit: true },
  { night: 'N9', hrs: 0, hit: null },
  { night: 'N10', hrs: 0, hit: null },
];

export const InsightsView: React.FC<InsightsViewProps> = ({
  graph,
  branch,
  onOpenRecord,
  onOpenGraphBranch,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(5); // Default focus on Nov 3 shift
  const [filterType, setFilterType] = useState<'all' | 'change' | 'relationship' | 'experiment'>('all');

  const activePoint = hoveredIdx !== null ? SLEEP_SERIES[hoveredIdx] : SLEEP_SERIES[5];

  // Sleep trajectory SVG geometry
  const W = 640;
  const H = 220;
  const padL = 44;
  const padR = 20;
  const padT = 22;
  const padB = 30;
  const minSleep = 260;
  const maxSleep = 480;
  const sx = (i: number) => padL + (i / (SLEEP_SERIES.length - 1)) * (W - padL - padR);
  const sy = (val: number) => padT + ((maxSleep - val) / (maxSleep - minSleep)) * (H - padT - padB);

  const linePath = SLEEP_SERIES.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.sleep).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${sx(SLEEP_SERIES.length - 1).toFixed(1)} ${H - padB} L ${sx(0).toFixed(1)} ${H - padB} Z`;

  // Polar screen-time radial bars (8 late-evening/night slots: 8 PM -> 3 AM)
  const polarSlots = [
    { label: '8 PM', pre: 18, post: 24 },
    { label: '9 PM', pre: 22, post: 32 },
    { label: '10 PM', pre: 25, post: 48 },
    { label: '11 PM', pre: 14, post: 78 },
    { label: '12 AM', pre: 6, post: 86 },
    { label: '1 AM', pre: 2, post: 54 },
    { label: '2 AM', pre: 0, post: 20 },
    { label: '7 PM', pre: 15, post: 18 },
  ];

  const insightFeed = [
    {
      id: 'ins-1',
      type: 'change' as const,
      badge: 'CHANGE POINT · PELT',
      color: 'var(--change)',
      title: 'Sleep duration dropped 47 min starting Nov 3',
      detail:
        '30-day rolling median fell from 7h 10m to 6h 23m across 5 of 7 consecutive days (> 2 MAD). Sustained 11-day regime shift.',
      records: ['sl_0412', 'sl_0413'],
      branchId: 'br_1',
    },
    {
      id: 'ins-2',
      type: 'relationship' as const,
      badge: 'PATTERN · PYTHON VERIFIED',
      color: 'var(--ok)',
      title: '4 of 5 headache days followed nights under 6 hours',
      detail:
        'Headache rate was 66% after <6h sleep vs 7% after >=7h sleep. One honest counterexample recorded on Nov 9 (7h 25m + headache).',
      records: ['sl_0412', 'hd_0031', 'sl_0398'],
      branchId: 'br_1',
    },
    {
      id: 'ins-3',
      type: 'relationship' as const,
      badge: 'SECONDARY SIGNAL',
      color: 'var(--amb)',
      title: 'Hydration dropped below 1 L on 3 of 5 headache days',
      detail:
        'Moderate co-occurrence (41% evidence score). Queued as competing Hypothesis #2 alongside short sleep.',
      records: ['wt_0210', 'hd_0031'],
      branchId: 'br_1',
    },
    {
      id: 'ins-4',
      type: 'experiment' as const,
      badge: 'VERIFIED KNOWLEDGE · SOLVED',
      color: 'var(--branch-open)',
      title: 'Caffeine after 4 PM cuts sleep by ~30 minutes',
      detail:
        'Confirmed via 14-day locked experiment (93% adherence) in October. Sub-branches melted into a verified Knowledge conclusion on your Root Graph.',
      records: ['sl_0412', 'sl_0413'],
      branchId: 'br_0',
    },
  ].filter((item) => filterType === 'all' || item.type === filterType);

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-7 space-y-6">
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-branchOpen">
            Deterministic Python Analytics · Zero AI Fabrication
          </div>
          <h1 className="mt-1 font-serif text-[28px] text-t1 leading-tight">
            Personal Health Insights &amp; Evidence Charts
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onOpenGraphBranch('br_1')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
        >
          <span>Inspect on Living Root Graph</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* 1. FOUR RICH KPI TELEMETRY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            icon: <Moon className="w-4 h-4 text-change" />,
            label: '30-DAY SLEEP SHIFT',
            value: '-47 min',
            sub: '7h 10m baseline → 6h 23m post-Nov 3',
            accent: 'var(--change)',
            rec: 'sl_0412',
          },
          {
            icon: <Flame className="w-4 h-4 text-ok" />,
            label: 'TOP HEADACHE DRIVER',
            value: '4 of 5',
            sub: 'Headache days followed <6h sleep',
            accent: 'var(--ok)',
            rec: 'hd_0031',
          },
          {
            icon: <Lock className="w-4 h-4 text-branchOpen" />,
            label: 'LOCKED EXPERIMENT',
            value: `${branch?.experiment?.adherence_pct ?? 80}%`,
            sub: 'Lights out 11:30 PM · 8/10 nights',
            accent: 'var(--branch-open)',
            rec: 'sl_0413',
          },
          {
            icon: <Sparkles className="w-4 h-4 text-subCyan" />,
            label: 'VERIFIED KNOWLEDGE',
            value: `${graph.knowledge.length} Verified`,
            sub: '100% citation-checked · 1 claim dropped',
            accent: 'var(--sub-cyan)',
            rec: 'wt_0210',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-4 flex flex-col justify-between transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] tracking-wider text-t3">{card.label}</span>
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
              >
                {card.icon}
              </span>
            </div>
            <div className="mt-3 font-serif text-[30px] leading-none" style={{ color: card.accent }}>
              {card.value}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-t2">{card.sub}</span>
              <button
                type="button"
                onClick={() => onOpenRecord(card.rec, 'raw')}
                className="font-mono text-[10px] font-semibold text-evi hover:underline shrink-0"
              >
                {card.rec}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 2. PRIMARY CHARTS ROW: 30-DAY SLEEP CHANGE-POINT CHART + TRIGGER QUADRANT SCATTER */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Chart A: Interactive Sleep Trajectory + Shaded Normal Band + PELT Change-Point */}
        <div
          className="xl:col-span-7 rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-branchOpen">
                <TrendingDown className="w-3.5 h-3.5 text-change" />
                <span>RUPTURES PELT CHANGE-POINT DETECTION</span>
              </div>
              <h2 className="mt-1 text-[16px] font-semibold text-t1">
                Sleep Duration vs. Personal 30-Day Normal Band
              </h2>
            </div>

            {/* Live Hovered Point Readout */}
            <div
              className="px-3 py-1.5 rounded-xl font-mono text-[10.5px] flex items-center gap-2.5"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border-strong)' }}
            >
              <span className="text-t1 font-bold">{activePoint.date}</span>
              <span className="text-branchOpen">
                {Math.floor(activePoint.sleep / 60)}h {activePoint.sleep % 60}m
              </span>
              {activePoint.headache && (
                <span className="text-change font-bold">
                  {activePoint.counterexample ? 'Counterexample' : 'Headache'}
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenRecord(activePoint.rec, 'raw')}
                className="text-evi underline"
              >
                {activePoint.rec}
              </button>
            </div>
          </div>

          <div className="mt-4 w-full overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[225px]">
              <defs>
                <linearGradient id="sleepAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--trunk)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--trunk)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines */}
              {[300, 360, 420, 480].map((m) => (
                <g key={m}>
                  <line
                    x1={padL}
                    y1={sy(m)}
                    x2={W - padR}
                    y2={sy(m)}
                    stroke="var(--border)"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={padL - 8}
                    y={sy(m) + 3.5}
                    textAnchor="end"
                    fill="var(--t3)"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {m / 60}h
                  </text>
                </g>
              ))}

              {/* Personal 30-day Normal MAD Band (405m - 455m) */}
              <rect
                x={padL}
                y={sy(455)}
                width={W - padL - padR}
                height={sy(405) - sy(455)}
                fill="var(--ok)"
                fillOpacity={0.09}
              />
              <line
                x1={padL}
                y1={sy(430)}
                x2={W - padR}
                y2={sy(430)}
                stroke="var(--ok)"
                strokeOpacity={0.45}
                strokeDasharray="5 4"
              />
              <text
                x={W - padR - 4}
                y={sy(455) + 12}
                textAnchor="end"
                fill="var(--ok)"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                Personal Normal Band (7h 10m ± 25m)
              </text>

              {/* Vertical PELT Change Point Split Line at Nov 03 (index 5) */}
              <line
                x1={sx(5)}
                y1={padT}
                x2={sx(5)}
                y2={H - padB}
                stroke="var(--change)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <rect
                x={sx(5) - 52}
                y={padT - 14}
                width="104"
                height="18"
                rx="9"
                fill="rgba(255, 77, 109, 0.16)"
                stroke="var(--change)"
                strokeWidth="0.8"
              />
              <text
                x={sx(5)}
                y={padT - 2}
                textAnchor="middle"
                fill="var(--change)"
                fontSize="8.5"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                SHIFT: NOV 3 (-47m)
              </text>

              {/* Sleep Area + Curve */}
              <path d={areaPath} fill="url(#sleepAreaGrad)" />
              <path
                d={linePath}
                fill="none"
                stroke="var(--branch-open)"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />

              {/* Interactive Data Points */}
              {SLEEP_SERIES.map((p, i) => {
                const isSelected = hoveredIdx === i;
                const fill = p.counterexample
                  ? 'var(--amb)'
                  : p.headache
                  ? 'var(--change)'
                  : 'var(--branch-open)';
                return (
                  <g
                    key={p.date}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onClick={() => onOpenRecord(p.rec, 'raw')}
                  >
                    <circle cx={sx(i)} cy={sy(p.sleep)} r={12} fill="transparent" />
                    <circle
                      cx={sx(i)}
                      cy={sy(p.sleep)}
                      r={isSelected ? 6 : p.headache ? 4.8 : 3.5}
                      fill={fill}
                      stroke="var(--bg)"
                      strokeWidth="1.8"
                    />
                    {i % 3 === 0 && (
                      <text
                        x={sx(i)}
                        y={H - 8}
                        textAnchor="middle"
                        fill="var(--t3)"
                        fontSize="9"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {p.date}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-t3">
            <span>Hover any point to inspect · Click any dot to open raw Apple Health record</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-change">● Headache day</span>
              <span className="flex items-center gap-1 text-amb">● Counterexample</span>
            </div>
          </div>
        </div>

        {/* Chart B: Sleep vs. Water 2D Trigger Scatter Quadrant */}
        <div
          className="xl:col-span-5 rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-subCyan">
              <Droplets className="w-3.5 h-3.5" />
              <span>MULTI-SIGNAL TRIGGER SEPARATION</span>
            </div>
            <h2 className="mt-1 text-[16px] font-semibold text-t1">
              Sleep vs. Hydration Trigger Matrix
            </h2>
            <p className="text-[11.5px] text-t3 mt-0.5">
              Headaches cluster tightly in the bottom-left zone (&lt;6h sleep &amp; &lt;1.2 L water).
            </p>
          </div>

          <svg viewBox="0 0 380 225" className="w-full h-[220px] mt-3">
            {/* High-Risk Bottom-Left Quadrant */}
            <rect
              x="44"
              y="108"
              width="136"
              height="84"
              rx="6"
              fill="rgba(255, 77, 109, 0.10)"
              stroke="rgba(255, 77, 109, 0.35)"
              strokeDasharray="4 3"
            />
            <text
              x="52"
              y="124"
              fill="var(--change)"
              fontSize="8.5"
              fontWeight="700"
              fontFamily="JetBrains Mono, monospace"
            >
              HIGH HEADACHE ZONE (4/5)
            </text>

            {/* Axes */}
            <line x1="44" y1="192" x2="358" y2="192" stroke="var(--border-strong)" />
            <line x1="44" y1="20" x2="44" y2="192" stroke="var(--border-strong)" />
            {/* 6h sleep threshold line */}
            <line x1="180" y1="20" x2="180" y2="192" stroke="var(--border)" strokeDasharray="3 4" />
            <text x="180" y="208" textAnchor="middle" fill="var(--t3)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              6.0h Sleep
            </text>
            <text x="348" y="208" textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              7.5h →
            </text>
            <text x="36" y="30" textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              2.2L
            </text>
            <text x="36" y="114" textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              1.2L
            </text>
            <text x="36" y="190" textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily="JetBrains Mono, monospace">
              0.6L
            </text>

            {/* Plot each day */}
            {SLEEP_SERIES.map((d) => {
              const px = 44 + ((d.sleep - 280) / (460 - 280)) * 305;
              const py = 192 - ((d.water - 0.6) / (2.3 - 0.6)) * 168;
              const col = d.counterexample ? 'var(--amb)' : d.headache ? 'var(--change)' : 'var(--branch-open)';
              return (
                <g
                  key={d.date}
                  className="cursor-pointer"
                  onClick={() => onOpenRecord(d.rec, 'raw')}
                >
                  <circle
                    cx={px}
                    cy={py}
                    r={d.headache ? 7 : 5}
                    fill={col}
                    fillOpacity={d.headache ? 0.85 : 0.65}
                    stroke="var(--bg)"
                    strokeWidth="1.5"
                  />
                  {d.counterexample && (
                    <text
                      x={px - 8}
                      y={py - 10}
                      textAnchor="end"
                      fill="var(--amb)"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Nov 9 counterexample
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* 3. SECONDARY CHARTS ROW: POLAR LATE-SCREEN CLOCK + BELIEF CALIBRATION + EXPERIMENT ADHERENCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card C: 24h / Late-Night Screen Spike Polar Chart */}
        <div
          className="rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="font-mono text-[10px] text-amb">UPSTREAM DRIVER · CIRCADIAN RADAR</div>
            <h3 className="mt-1 text-[15px] font-semibold text-t1">
              Late-Night Screen Surge (Post-Nov 3)
            </h3>
          </div>
          <svg viewBox="0 0 260 210" className="w-full h-[195px] my-1">
            {[28, 52, 76].map((r) => (
              <circle key={r} cx="130" cy="106" r={r} fill="none" stroke="var(--border)" />
            ))}
            {polarSlots.map((slot, i) => {
              const ang = ((i / polarSlots.length) * Math.PI * 2) - Math.PI / 2;
              const rPost = (slot.post / 95) * 76;
              const rPre = (slot.pre / 95) * 76;
              const x2 = 130 + Math.cos(ang) * rPost;
              const y2 = 106 + Math.sin(ang) * rPost;
              const xPre = 130 + Math.cos(ang) * rPre;
              const yPre = 106 + Math.sin(ang) * rPre;
              const lx = 130 + Math.cos(ang) * 92;
              const ly = 106 + Math.sin(ang) * 92;
              const isDanger = slot.label === '11 PM' || slot.label === '12 AM' || slot.label === '1 AM';
              return (
                <g key={slot.label}>
                  <line
                    x1="130"
                    y1="106"
                    x2={x2}
                    y2={y2}
                    stroke={isDanger ? 'var(--change)' : 'var(--branch-open)'}
                    strokeWidth={isDanger ? 8 : 5}
                    strokeOpacity={isDanger ? 0.85 : 0.48}
                    strokeLinecap="round"
                  />
                  <circle cx={xPre} cy={yPre} r="3" fill="var(--ok)" />
                  <text
                    x={lx}
                    y={ly + 3}
                    textAnchor="middle"
                    fill={isDanger ? 'var(--change)' : 'var(--t3)'}
                    fontSize="9"
                    fontWeight={isDanger ? '700' : '500'}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {slot.label}
                  </text>
                </g>
              );
            })}
            <circle cx="130" cy="106" r="10" fill="var(--s1)" stroke="var(--border-strong)" />
          </svg>
          <p className="font-mono text-[10px] text-t3">
            11 PM–1 AM screen minutes rose 3.8× after Nov 3 (green dots = Oct baseline).
          </p>
        </div>

        {/* Card D: Gut Belief vs. Python-Verified Evidence Calibration */}
        <div
          className="rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="font-mono text-[10px] text-hyp">EPISTEMIC CALIBRATION</div>
            <h3 className="mt-1 text-[15px] font-semibold text-t1">
              Initial Belief vs. Measured Evidence
            </h3>
            <p className="text-[11px] text-t3 mt-0.5">
              Compares what you suspected vs. what Python proved from records.
            </p>
          </div>

          <div className="space-y-3.5 my-3">
            {[
              { name: 'Short sleep (<6h)', belief: 45, evidence: 72, col: 'var(--ok)', rec: 'sl_0412' },
              { name: 'Low water (<1 L)', belief: 70, evidence: 41, col: 'var(--amb)', rec: 'wt_0210' },
              { name: 'Late caffeine (>4 PM)', belief: 55, evidence: 84, col: 'var(--branch-open)', rec: 'sl_0413' },
              { name: 'Screen light alone', belief: 60, evidence: 28, col: 'var(--change)', rec: 'hd_0031' },
            ].map((row) => (
              <div key={row.name} className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-medium text-t1">{row.name}</span>
                  <button
                    type="button"
                    onClick={() => onOpenRecord(row.rec, 'raw')}
                    className="font-mono text-[10px] text-t2 hover:text-evi"
                  >
                    Belief {row.belief}% → <strong style={{ color: row.col }}>{row.evidence}%</strong>
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--s2)' }}>
                    <div
                      className="h-full rounded-full opacity-45"
                      style={{ width: `${row.belief}%`, backgroundColor: 'var(--hyp)' }}
                    />
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--s2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.evidence}%`, backgroundColor: row.col }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 font-mono text-[9.5px] text-t3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 rounded-full bg-hyp opacity-60" /> Initial gut belief
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 rounded-full bg-ok" /> Python-verified evidence
            </span>
          </div>
        </div>

        {/* Card E: Active Experiment 10-Night Adherence Heatmap */}
        <div
          className="rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-branchOpen">LOCKED EXPERIMENT · EXP_1</span>
              <Lock className="w-3.5 h-3.5 text-branchOpen" />
            </div>
            <h3 className="mt-1 font-serif italic text-[17px] text-t1">
              Lights out by 11:30 PM (10 nights)
            </h3>
            <p className="mt-0.5 font-mono text-[10px] text-t3">
              Criterion: Sleep avg &gt; 7h on ≥ 7 of 10 nights
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2 my-4">
            {EXPERIMENT_NIGHTS.map((n) => (
              <div
                key={n.night}
                className="rounded-lg p-2 text-center"
                style={{
                  backgroundColor:
                    n.hit === true
                      ? 'rgba(16, 185, 129, 0.16)'
                      : n.hit === false
                      ? 'rgba(255, 77, 109, 0.14)'
                      : 'var(--s2)',
                  border:
                    n.hit === true
                      ? '1px solid rgba(16, 185, 129, 0.45)'
                      : n.hit === false
                      ? '1px solid rgba(255, 77, 109, 0.35)'
                      : '1px dashed var(--border)',
                }}
              >
                <div className="font-mono text-[9.5px] text-t3">{n.night}</div>
                <div
                  className="mt-0.5 font-mono text-[11px] font-bold"
                  style={{
                    color: n.hit === true ? 'var(--ok)' : n.hit === false ? 'var(--change)' : 'var(--t3)',
                  }}
                >
                  {n.hit === null ? '—' : `${n.hrs}h`}
                </div>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl px-3 py-2 flex items-center justify-between font-mono text-[10.5px]"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <span className="text-t2">6 of 8 nights met target</span>
            <span className="text-ok font-bold">On track (80%)</span>
          </div>
        </div>
      </div>

      {/* 4. FILTERABLE VERIFIED INSIGHT CARDS FEED */}
      <div className="space-y-3.5 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-branchOpen" />
            <h2 className="text-[15px] font-semibold text-t1">Verified Evidence Findings</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'change', 'relationship', 'experiment'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className="px-3 py-1 rounded-full font-mono text-[10.5px] capitalize transition-colors"
                style={{
                  backgroundColor: filterType === t ? 'var(--s2)' : 'var(--s1)',
                  color: filterType === t ? 'var(--branch-open)' : 'var(--t3)',
                  border: filterType === t ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insightFeed.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl p-4 flex flex-col justify-between gap-3"
              style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold"
                    style={{ color: item.color }}
                  >
                    {item.type === 'change' ? (
                      <AlertTriangle className="w-3 h-3" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    {item.badge}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenGraphBranch(item.branchId)}
                    className="font-mono text-[10px] text-branchOpen hover:underline"
                  >
                    View on Graph →
                  </button>
                </div>
                <h3 className="mt-2 text-[14.5px] font-semibold text-t1">{item.title}</h3>
                <p className="mt-1 text-[12px] text-t2 leading-relaxed">{item.detail}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="font-mono text-[9.5px] text-t3 mr-1">Provenance:</span>
                {item.records.map((rid) => (
                  <button
                    key={rid}
                    type="button"
                    onClick={() => onOpenRecord(rid, 'raw')}
                    className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold transition-transform hover:scale-105"
                    style={{
                      backgroundColor: 'var(--bg)',
                      color: 'var(--evi)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                    }}
                  >
                    {rid}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
