import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  ExternalLink,
  FileUp,
  HelpCircle,
  Lock,
  Palette,
  RotateCcw,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  Watch,
} from 'lucide-react';
import type { ThemeMode } from '../types';

export const THEME_OPTIONS: Array<{
  id: ThemeMode;
  name: string;
  tag: string;
  desc: string;
  swatches: string[];
}> = [
  {
    id: 'slate-pro',
    name: 'Obsidian Slate',
    tag: 'RECOMMENDED DEFAULT',
    desc: 'Refined clinical dark slate with crisp teal signals and high contrast for demos & projectors.',
    swatches: ['#090e14', '#0f1620', '#14b8a6', '#38bdf8'],
  },
  {
    id: 'teal',
    name: 'Abyssal Teal',
    tag: 'BIOLUMINESCENT',
    desc: 'Deep bluish-green organic dark mode with glowing emerald & cyan root aesthetics.',
    swatches: ['#030c0e', '#07161a', '#14b8a6', '#2dd4bf'],
  },
  {
    id: 'warm-neuro',
    name: 'Warm Neurological',
    tag: 'ARCHITECTURE REVIEW',
    desc: 'Mahogany dark canvas with warm synaptic amber trunk and cream typography.',
    swatches: ['#100802', '#1a0e05', '#e8821e', '#ffe8c8'],
  },
  {
    id: 'lab-ivory',
    name: 'Precision Ivory',
    tag: 'DAYLIGHT LAB',
    desc: 'Swiss scientific notebook light theme with ivory paper, graphite ink, and cobalt accents.',
    swatches: ['#f6f5f0', '#ffffff', '#0f766e', '#1d4ed8'],
  },
  {
    id: 'ppt-light',
    name: 'Editorial Cream',
    tag: 'PITCH DECK MATCH',
    desc: 'High-contrast warm cream, deep navy, and orange matching the pitch deck palette.',
    swatches: ['#f8f2e4', '#fffdf8', '#1b1f6b', '#fd9b36'],
  },
];

// =========================================================
// 1. PROFILE VIEW (CONNECTED ACCOUNTS + 5-THEME GALLERY)
// =========================================================
export const ProfileView: React.FC<{
  theme: ThemeMode;
  totalRecords: number;
  isDataConnected: boolean;
  onThemeChange: (t: ThemeMode) => void;
  onGoConnect: () => void;
}> = ({ theme, totalRecords, isDataConnected, onThemeChange, onGoConnect }) => (
  <div className="h-full overflow-y-auto p-7 max-w-5xl mx-auto space-y-6">
    <div
      className="rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4"
      style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-mono text-[18px] font-bold"
          style={{
            backgroundColor: 'rgba(20, 184, 166, 0.18)',
            color: 'var(--branch-open)',
            border: '1.5px solid var(--branch-open)',
          }}
        >
          ST
        </div>
        <div>
          <h1 className="font-serif text-[25px] text-t1">Satwik · Personal Workspace</h1>
          <p className="font-mono text-[11px] text-t3">
            {totalRecords} observations indexed · Privacy Gate: Presidio + Bedrock Guardrail (ap-south-1 Mumbai)
          </p>
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] font-semibold"
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          color: 'var(--ok)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
        }}
      >
        <ShieldCheck className="w-3.5 h-3.5" /> Raw Data Never Sent to AI
      </span>
    </div>

    {/* Connected Account Details */}
    <div
      className="rounded-2xl p-6 space-y-4"
      style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-t1">Connected Health Accounts &amp; Sources</h2>
          <p className="text-[12px] text-t3">
            Device owner names, birth date, and GPS tracks are stripped automatically during import.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoConnect}
          className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-t1"
          style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--trunk)' }}
        >
          Manage uploads &amp; coverage
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {[
          {
            icon: <Smartphone className="w-5 h-5 text-branchOpen" />,
            name: 'Apple Health Export',
            status: isDataConnected ? `Connected · ${Math.max(0, totalRecords - 102)} records` : 'Disconnected',
            detail: 'apple_health_export.xml · iPhone 15 Pro (owner name scrubbed)',
            connected: isDataConnected,
          },
          {
            icon: <Watch className="w-5 h-5 text-subCyan" />,
            name: 'Google Health / Fitbit',
            status: 'Ready to link (OAuth)',
            detail: 'Read-only web OAuth for Fitbit & Pixel Watch sensors',
            connected: false,
          },
          {
            icon: <CheckCircle2 className="w-5 h-5 text-ok" />,
            name: 'Manual & ElevenLabs Voice',
            status: isDataConnected ? 'Active · 102 logs' : 'Paused',
            detail: 'Headache, hydration, mood & voice branch check-ins',
            connected: isDataConnected,
          },
        ].map((acc) => (
          <div
            key={acc.name}
            className="rounded-xl p-4 space-y-2"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              {acc.icon}
              <span
                className="font-mono text-[10px] font-semibold"
                style={{ color: acc.connected ? 'var(--ok)' : 'var(--amb)' }}
              >
                {acc.connected ? 'CONNECTED' : 'NOT LINKED'}
              </span>
            </div>
            <div className="text-[13.5px] font-semibold text-t1">{acc.name}</div>
            <div className="font-mono text-[10.5px] text-t2">{acc.status}</div>
            <p className="text-[11px] text-t3 leading-relaxed">{acc.detail}</p>
          </div>
        ))}
      </div>
    </div>

    {/* 5-Theme Workspace Gallery */}
    <div
      className="rounded-2xl p-6 space-y-4"
      style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-branchOpen" />
          <h2 className="text-[15px] font-semibold text-t1">Workspace Appearance (5 Themes)</h2>
        </div>
        <span className="font-mono text-[10px] text-t3">Switches live across graph, charts &amp; modals</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {THEME_OPTIONS.map((opt) => {
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onThemeChange(opt.id)}
              className="rounded-xl p-4 text-left flex flex-col justify-between transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: 'var(--s2)',
                border: active ? '2px solid var(--branch-open)' : '1px solid var(--border)',
              }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold text-t1">{opt.name}</span>
                  {active ? (
                    <span className="font-mono text-[9.5px] font-bold text-branchOpen">ACTIVE</span>
                  ) : (
                    <span className="font-mono text-[8.5px] text-t3">{opt.tag}</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] text-t3 leading-relaxed">{opt.desc}</p>
              </div>
              <div className="mt-3.5 flex items-center gap-2">
                {opt.swatches.map((hex) => (
                  <span
                    key={hex}
                    className="w-6 h-6 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: hex }}
                    title={hex}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

// =========================================================
// 2. DATA & HELP VIEW (UPLOAD COVERAGE GRAPHS + IMPORTERS + GUIDES)
// =========================================================
const BASE_WEEKLY_UPLOADS = [
  { week: 'W1', apple: 54, manual: 7 },
  { week: 'W2', apple: 58, manual: 8 },
  { week: 'W3', apple: 62, manual: 6 },
  { week: 'W4', apple: 60, manual: 9 },
  { week: 'W5', apple: 64, manual: 8 },
  { week: 'W6', apple: 61, manual: 9 },
  { week: 'W7', apple: 59, manual: 10 },
  { week: 'W8', apple: 63, manual: 7 },
  { week: 'W9', apple: 65, manual: 8 },
  { week: 'W10', apple: 68, manual: 11 },
  { week: 'W11', apple: 64, manual: 10 },
  { week: 'W12', apple: 67, manual: 9 },
];

export const ConnectDataView: React.FC<{
  totalRecords: number;
  isDataConnected: boolean;
  onDataUploaded: (addedRecords: number, fileName: string) => void;
  onReloadDemo: () => void;
}> = ({ totalRecords, isDataConnected, onDataUploaded, onReloadDemo }) => {
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'done'>('idle');
  const [lastFile, setLastFile] = useState('');
  const [extraBatch, setExtraBatch] = useState(0);
  const [googleNotice, setGoogleNotice] = useState(false);

  const handleFile = (file?: File) => {
    const name = file?.name || 'apple_health_export.xml';
    setLastFile(name);
    setUploadState('processing');
    setTimeout(() => {
      const added = 148;
      setExtraBatch((e) => e + added);
      onDataUploaded(added, name);
      setUploadState('done');
    }, 750);
  };

  const weeklyBars = isDataConnected
    ? BASE_WEEKLY_UPLOADS.map((w, idx) =>
        idx === BASE_WEEKLY_UPLOADS.length - 1 ? { ...w, apple: w.apple + extraBatch } : w
      )
    : BASE_WEEKLY_UPLOADS.map((w) => ({ ...w, apple: 0, manual: 0 }));

  const maxWeekTotal = Math.max(85, ...weeklyBars.map((w) => w.apple + w.manual));

  const metricBreakdown = [
    { name: 'Sleep Duration (sleep_min)', count: isDataConnected ? 270 + Math.round(extraBatch * 0.35) : 0, coverage: isDataConnected ? 97 : 0, color: 'var(--branch-open)' },
    { name: 'Daily Steps (steps)', count: isDataConnected ? 255 + Math.round(extraBatch * 0.35) : 0, coverage: isDataConnected ? 94 : 0, color: 'var(--sub-cyan)' },
    { name: 'Late Screen Time (late_screen_min)', count: isDataConnected ? 142 + Math.round(extraBatch * 0.15) : 0, coverage: isDataConnected ? 93 : 0, color: 'var(--hyp)' },
    { name: 'Hydration Logs (water_ml)', count: isDataConnected ? 104 + Math.round(extraBatch * 0.1) : 0, coverage: isDataConnected ? 87 : 0, color: 'var(--sub-emerald)' },
    { name: 'Headache & Mood Check-ins', count: isDataConnected ? 76 + Math.round(extraBatch * 0.05) : 0, coverage: isDataConnected ? 100 : 0, color: 'var(--amb)' },
  ];

  return (
    <div className="h-full overflow-y-auto p-7 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-branchOpen">
            Ingestion Telemetry &amp; Export Guides
          </div>
          <h1 className="mt-1 font-serif text-[28px] text-t1 leading-tight">
            Uploaded Data Coverage &amp; Help Center
          </h1>
        </div>
        {!isDataConnected && (
          <button
            type="button"
            onClick={onReloadDemo}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold"
            style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reload 90-Day Demo Dataset
          </button>
        )}
      </div>

      {/* 1. UPLOADED DATA VOLUME GRAPH + METRIC COMPLETENESS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Stacked Weekly Upload Volume Chart */}
        <div
          className="xl:col-span-7 rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-branchOpen">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>UPLOADED DATA VOLUME BY WEEK (90 DAYS)</span>
              </div>
              <h2 className="mt-1 text-[16px] font-semibold text-t1">
                {totalRecords.toLocaleString()} Normalized Observations Stored
              </h2>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-t3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--trunk)' }} />
                Apple Health XML
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--sub-cyan)' }} />
                Manual / Voice
              </span>
            </div>
          </div>

          <svg viewBox="0 0 560 205" className="w-full h-[200px] mt-4">
            {[0, 0.5, 1].map((frac) => {
              const y = 172 - frac * 144;
              const val = Math.round(maxWeekTotal * frac);
              return (
                <g key={frac}>
                  <line x1="36" y1={y} x2="548" y2={y} stroke="var(--border)" strokeDasharray="3 4" />
                  <text
                    x="30"
                    y={y + 3}
                    textAnchor="end"
                    fill="var(--t3)"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {weeklyBars.map((w, i) => {
              const slotW = (548 - 44) / weeklyBars.length;
              const bx = 46 + i * slotW + 6;
              const bw = slotW - 14;
              const hApple = (w.apple / maxWeekTotal) * 144;
              const hManual = (w.manual / maxWeekTotal) * 144;
              const yApple = 172 - hApple;
              const yManual = yApple - hManual;
              return (
                <g key={w.week}>
                  <rect
                    x={bx}
                    y={yApple}
                    width={bw}
                    height={Math.max(0, hApple)}
                    rx="3"
                    fill="var(--trunk)"
                    fillOpacity="0.88"
                  />
                  <rect
                    x={bx}
                    y={yManual}
                    width={bw}
                    height={Math.max(0, hManual)}
                    rx="3"
                    fill="var(--sub-cyan)"
                    fillOpacity="0.9"
                  />
                  <text
                    x={bx + bw / 2}
                    y="190"
                    textAnchor="middle"
                    fill="var(--t3)"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {w.week}
                  </text>
                </g>
              );
            })}
          </svg>

          <div
            className="mt-2 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <span className="text-ok font-semibold">
              ✓ SHA-256 Deduplicated · 0 duplicate rows on re-import
            </span>
            <span className="text-t3">Stripped at import: DOB · Owner Name · GPS Routes</span>
          </div>
        </div>

        {/* Metric Breakdown & Coverage Bars */}
        <div
          className="xl:col-span-5 rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-subCyan">
              <Database className="w-3.5 h-3.5" />
              <span>METRIC BREAKDOWN &amp; 90-DAY COVERAGE</span>
            </div>
            <h2 className="mt-1 text-[16px] font-semibold text-t1">Records by Health Signal</h2>
          </div>

          <div className="space-y-3.5 my-4">
            {metricBreakdown.map((m) => (
              <div key={m.name} className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-medium text-t1">{m.name}</span>
                  <span className="font-mono text-[10.5px] text-t2">
                    {m.count} rows · <strong style={{ color: m.color }}>{m.coverage}%</strong>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--s2)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${m.coverage}%`, backgroundColor: m.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="font-mono text-[10px] text-t3">
            Minimum rules enforced: ≥ 7 observations for baseline, ≥ 10 for patterns, ≥ 70% adherence for experiments.
          </p>
        </div>
      </div>

      {/* 2. FILE UPLOAD + GOOGLE HEALTH OAUTH */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-[14.5px] font-semibold text-t1">Upload Apple Health XML, Health Connect ZIP or CSV</h2>
          <label
            className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
            style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--bg)' }}
          >
            <FileUp className="w-7 h-7 text-branchOpen mb-2.5" />
            <span className="text-[13px] font-medium text-t1 text-center">
              Drop export.xml, Health Connect ZIP, or CSV
            </span>
            <span className="mt-1 font-mono text-[10.5px] text-t3 text-center">
              Stream-parsed · updates uploaded records graph live
            </span>
            <input
              type="file"
              className="hidden"
              accept=".xml,.csv,.zip,.json"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>

          {uploadState === 'processing' && (
            <div className="font-mono text-[11.5px] text-branchOpen">
              Stream-parsing {lastFile} · stripping DOB, owner name &amp; GPS...
            </div>
          )}
          {uploadState === 'done' && (
            <div
              className="rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-[12px] font-medium"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: 'var(--ok)',
              }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>+148 cleaned records merged from {lastFile} (0 PII fields retained)</span>
            </div>
          )}
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col justify-between gap-4"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div className="space-y-3">
            <h2 className="text-[14.5px] font-semibold text-t1">Connect Wearable Account (OAuth)</h2>
            <p className="text-[12.5px] text-t2 leading-relaxed">
              Link Fitbit or Pixel Watch via the Google Health API using read-only web OAuth. Tokens
              are stored encrypted and can be revoked anytime with one click.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setGoogleNotice(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-t1"
                style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--trunk)' }}
              >
                <Watch className="w-4 h-4 text-branchOpen" />
                <span>Connect with Google Health</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
            {googleNotice && (
              <p className="font-mono text-[11px] text-amb">
                Google Health OAuth is scheduled for Hack Day (Ring 3). Demo &amp; file uploads are live now.
              </p>
            )}
          </div>

          <div
            className="rounded-xl p-3.5 font-mono text-[10.5px] text-t3"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            Top-right status pill turns <strong className="text-ok">Connected</strong> automatically whenever ≥ 1 health source is active.
          </div>
        </div>
      </div>

      {/* 3. HELP CENTER: STEP-BY-STEP EXPORT GUIDES */}
      <div className="space-y-3 pb-6">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-branchOpen" />
          <h2 className="text-[15px] font-semibold text-t1">Help Guide: How to Export Your Data</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'iPhone / Apple Watch',
              steps: 'Open Apple Health → tap Profile photo (top right) → scroll down → "Export All Health Data" → drop export.xml here.',
            },
            {
              title: 'Android / Samsung / WearOS',
              steps: 'Open Health Connect (Android 14+) → Data and access → Export data → save scheduled ZIP → upload directly.',
            },
            {
              title: 'Custom CSV / Manual Logs',
              steps: 'Drop any CSV with columns: date, sleep_min, steps, water_ml, headache. Or use "Speak (ElevenLabs)" on the Dashboard.',
            },
          ].map((g) => (
            <div
              key={g.title}
              className="rounded-xl p-4 space-y-1.5"
              style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
            >
              <div className="text-[13px] font-semibold text-t1">{g.title}</div>
              <p className="text-[11.5px] text-t3 leading-relaxed">{g.steps}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// =========================================================
// 3. PRIVACY & DATA OWNERSHIP VIEW (5-LAYER PIPELINE + POLICY TABLE + FAQS)
// =========================================================
const PRIVACY_FAQS = [
  {
    q: 'Does my raw Apple Health file or exact timestamped log ever go to the AI?',
    a: 'Never. Python parses your file, computes rolling 30-day medians and pattern counts, and sends only compact aggregated summaries (e.g., "sleep averaged 6h 02m, records sl_0412–sl_0425") to Amazon Bedrock.',
  },
  {
    q: 'How are personal names, phone numbers, Aadhaar, and PAN protected?',
    a: 'Every free-text question, note, or voice transcript passes through Microsoft Presidio locally on our backend first—replacing identifiers with placeholders like [PERSON_1] and [PHONE_1]. Amazon Bedrock Guardrails (Mask mode) runs as a second safety net, and you can verify the exact payload via "What the AI saw".',
  },
  {
    q: 'Where are AI requests processed, and does AWS train on my data?',
    a: 'All Bedrock calls use Claude Haiku 4.5 via the India inference profile in the Mumbai region (ap-south-1). Amazon Bedrock does not store, log, or train models on your prompts or completions.',
  },
  {
    q: 'How does RootTrace handle ElevenLabs voice privacy?',
    a: 'Spoken summaries use ElevenLabs text-to-speech only after text has been scrubbed of personal details. Voice input is strictly opt-in, audio buffers are discarded from browser RAM after transcription, and we display a reminder not to speak personal names.',
  },
  {
    q: 'Is RootTrace medical advice? What happens with serious symptoms?',
    a: 'No. RootTrace surfaces personal patterns for self-experimentation and never names diseases or suggests medicines/doses. A deterministic red-flag rule runs BEFORE the AI on chest pain, fainting, sudden severe headache, trouble breathing, one-sided weakness, or self-harm—immediately showing urgent care guidance (call 112).',
  },
  {
    q: 'What does "your knowledge lives in files you own" mean?',
    a: 'SQLite runs your fast rolling baselines and locked-criterion triggers, while 1-click Obsidian Export downloads your branches and verified conclusions as standard plain-text Markdown files with wikilinks—zero vendor lock-in.',
  },
];

export const PrivacyView: React.FC<{
  theme: ThemeMode;
  isDataConnected: boolean;
  onThemeChange: (t: ThemeMode) => void;
  onInspectPayload: () => void;
  onDeleteAllData: () => void;
  onReloadDemo: () => void;
}> = ({ theme, isDataConnected, onThemeChange, onInspectPayload, onDeleteAllData, onReloadDemo }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportedNote, setExportedNote] = useState(false);

  const handleDownloadObsidianNote = () => {
    const md = `---
roottrace_export: true
exported_at: ${new Date().toISOString()}
privacy_mode: presidio_plus_bedrock_mumbai
---

# RootTrace Personal Knowledge Vault

## Verified Knowledge
- **Oct 22, 2026** — Caffeine after 4 PM cuts my sleep by about 30 min *(Confidence: Medium · Records: [[sl_0412]], [[sl_0413]])*

## Active Investigation: Why do I keep getting headaches?
- **Triggered by:** Sleep down 47 min on Nov 3 (PELT change detection)
- **Rank #1 Hypothesis (72%):** Short sleep — 4 of 5 headache days followed nights under 6 hours ([[sl_0412]], [[hd_0031]])
- **Locked Experiment:** Lights out by 11:30 PM for 10 nights (Criterion locked Nov 10 via SQLite trigger · 80% adherence)

> *Personal pattern, not medical advice. Raw health records were never transmitted to external AI models.*
`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'RootTrace-Obsidian-Vault-Summary.md';
    a.click();
    URL.revokeObjectURL(url);
    setExportedNote(true);
  };

  return (
    <div className="h-full overflow-y-auto p-7 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-branchOpen">
            Trust Architecture · Zero Raw AI Exposure
          </div>
          <h1 className="mt-1 font-serif text-[28px] text-t1 leading-tight">
            Privacy, Data Policy &amp; Ownership
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onInspectPayload}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold"
            style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
          >
            Inspect "What the AI saw"
          </button>
          <button
            type="button"
            onClick={handleDownloadObsidianNote}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-t1"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border-strong)' }}
          >
            <Download className="w-3.5 h-3.5 text-branchOpen" />
            <span>Export Obsidian Markdown</span>
          </button>
        </div>
      </div>

      {exportedNote && (
        <div
          className="rounded-xl px-4 py-2.5 flex items-center gap-2 font-mono text-[11px]"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: 'var(--ok)',
          }}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Downloaded RootTrace-Obsidian-Vault-Summary.md — open directly in Obsidian or any text editor.</span>
        </div>
      )}

      {/* 1. FIVE-LAYER PRIVACY ARCHITECTURE */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 font-mono text-[10.5px] font-bold text-branchOpen">
          <Shield className="w-4 h-4" />
          <span>5-LAYER PRIVACY GATE (ENFORCED IN PYTHON, NOT JUST PROMPTS)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { step: '01', title: 'Strip at Import', desc: 'Drops DOB, sex, blood type, GPS workout tracks & owner names before storage.' },
            { step: '02', title: 'Summaries Only', desc: 'AI receives compact pandas stats & record IDs — never raw timestamped rows.' },
            { step: '03', title: 'Presidio Scrub', desc: 'Masks names, phones, emails, Aadhaar & PAN locally into [PERSON_1] tokens.' },
            { step: '04', title: 'Bedrock Mumbai', desc: 'Guardrail in Mask mode inside ap-south-1 (India). Zero logging or model training.' },
            { step: '05', title: 'Citation Check', desc: 'Python verifies every record ID & number before display. Uncited claims drop.' },
          ].map((l) => (
            <div
              key={l.step}
              className="rounded-xl p-3.5 space-y-1.5"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              <div className="font-mono text-[10px] font-bold text-branchOpen">LAYER {l.step}</div>
              <div className="text-[13px] font-semibold text-t1">{l.title}</div>
              <p className="text-[11px] text-t3 leading-relaxed">{l.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. TRANSPARENT DATA POLICY TABLE */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
      >
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-branchOpen" />
            <h2 className="text-[14.5px] font-semibold text-t1">Data Policy: Where Every Byte Goes</h2>
          </div>
          <span className="font-mono text-[10px] text-ok">No data is ever sold or used for ads</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--s2)', borderBottom: '1px solid var(--border)' }}>
                <th className="py-2.5 px-5 font-mono text-[10px] uppercase text-t3">Service</th>
                <th className="py-2.5 px-5 font-mono text-[10px] uppercase text-t3">What It Receives</th>
                <th className="py-2.5 px-5 font-mono text-[10px] uppercase text-t3">Privacy Protection</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[12px]" style={{ borderColor: 'var(--border)' }}>
              {[
                {
                  svc: 'RootTrace Backend (AWS Mumbai)',
                  recv: 'Cleaned observations, encrypted file store',
                  prot: 'Random user ID separated from email; request bodies never logged; 1-click full wipe.',
                },
                {
                  svc: 'Amazon Bedrock (Claude Haiku 4.5)',
                  recv: 'Presidio-scrubbed summaries & tool numbers only',
                  prot: 'India inference profile (ap-south-1) + Guardrail Mask mode; zero storage or training.',
                },
                {
                  svc: 'ElevenLabs Voice (Opt-In)',
                  recv: 'Scrubbed summary text (TTS) / opt-in voice clips (STT)',
                  prot: 'Audio discarded from browser RAM post-parse; cached clips avoid repeat calls.',
                },
                {
                  svc: 'Your Local Obsidian Export',
                  recv: 'Plain Markdown notes + YAML frontmatter',
                  prot: '100% owned on your machine; works without RootTrace servers forever.',
                },
              ].map((row) => (
                <tr key={row.svc} style={{ borderColor: 'var(--border)' }}>
                  <td className="py-3 px-5 font-semibold text-t1 whitespace-nowrap">{row.svc}</td>
                  <td className="py-3 px-5 text-t2">{row.recv}</td>
                  <td className="py-3 px-5 text-t3">{row.prot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. INTERACTIVE PRIVACY & SAFETY FAQS */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-branchOpen" />
          <h2 className="text-[15px] font-semibold text-t1">Privacy &amp; Safety FAQs</h2>
        </div>
        <div className="space-y-2.5">
          {PRIVACY_FAQS.map((faq, idx) => {
            const open = openFaq === idx;
            return (
              <div
                key={faq.q}
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : idx)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left"
                >
                  <span className="text-[13px] font-semibold text-t1">{faq.q}</span>
                  {open ? (
                    <ChevronUp className="w-4 h-4 text-branchOpen shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-t3 shrink-0" />
                  )}
                </button>
                {open && (
                  <div
                    className="px-5 pb-4 pt-1 text-[12.5px] text-t2 leading-relaxed border-t"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. QUICK THEME PICKER + DANGER ZONE (1-CLICK DELETE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-6">
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 text-[14px] font-semibold text-t1">
            <Palette className="w-4 h-4 text-branchOpen" />
            <span>Quick Theme Switch</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onThemeChange(t.id)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11.5px] font-medium transition-all"
                style={{
                  backgroundColor: theme === t.id ? 'var(--s2)' : 'var(--bg)',
                  color: theme === t.id ? 'var(--branch-open)' : 'var(--t2)',
                  border: theme === t.id ? '1.2px solid var(--branch-open)' : '1px solid var(--border)',
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.swatches[2] }} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col justify-between gap-3"
          style={{
            backgroundColor: 'rgba(255, 77, 109, 0.06)',
            border: '1px solid rgba(255, 77, 109, 0.28)',
          }}
        >
          <div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] font-bold text-change">
              <AlertTriangle className="w-4 h-4" />
              <span>DATA OWNERSHIP · PERMANENT WIPE</span>
            </div>
            <p className="mt-1 text-[12px] text-t2">
              Delete all imported observations, cached audio, and uploaded files immediately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isDataConnected ? (
              <button
                type="button"
                onClick={onReloadDemo}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold"
                style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore 90-Day Demo Data
              </button>
            ) : !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-change"
                style={{
                  backgroundColor: 'rgba(255, 77, 109, 0.12)',
                  border: '1px solid rgba(255, 77, 109, 0.42)',
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete all my data
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteAllData();
                    setConfirmDelete(false);
                  }}
                  className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white"
                  style={{ backgroundColor: 'var(--change)' }}
                >
                  Confirm Permanent Wipe
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 rounded-xl text-[12px] text-t2"
                  style={{ backgroundColor: 'var(--s2)' }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
