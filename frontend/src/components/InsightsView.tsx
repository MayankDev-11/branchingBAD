import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Droplets,
  Flame,
  Lock,
  Moon,
  MonitorSmartphone,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import type { GraphResponse, InsightsHypothesis, InsightsResponse } from '../types';

// Every number on this page comes from GET /api/insights or GET /api/graph, computed in
// Python from the records (rule 9). This file only formats and draws them.

interface InsightsViewProps {
  insights: InsightsResponse;
  graph: GraphResponse | null;
  onOpenRecord: (id: string, tab?: 'raw' | 'ai') => void;
  onOpenGraphBranch: (branchId: string) => void;
}

const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const last = <T,>(items: T[]): T | undefined => items[items.length - 1];

const addDays =(iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const findHyp =(hyps: InsightsHypothesis[], metric: string, branchId?: string) =>
  hyps.find((h) => h.metric === metric && (!branchId || h.branch_id === branchId));

const MONO = 'JetBrains Mono, monospace';

export const InsightsView: React.FC<InsightsViewProps> = ({ insights, graph, onOpenRecord, onOpenGraphBranch }) => {
  const { sleep_shift: shift, experiment, hypotheses, screen } = insights;
  const days = insights.days.filter((d) => d.sleep !== null);
  const [filterType, setFilterType] = useState<'all' | 'change' | 'relationship' | 'experiment'>('all');

  // The branch the running experiment belongs to (the headache question in the demo).
  const focusBranchId = experiment?.branch_id ?? last(hypotheses)?.branch_id ?? 'br_1';
  const focusHyps = hypotheses.filter((h) => h.branch_id === focusBranchId);
  const topHyp = focusHyps[0];
  const shortSleep = findHyp(hypotheses, 'sleep_min', focusBranchId);
  const lowWater = findHyp(hypotheses, 'water_ml', focusBranchId);

  const shiftIdx = shift ? days.findIndex((d) => d.date >= shift.date) : -1;
  const isCounterexample = (d: (typeof days)[number]) =>
    Boolean(d.headache && shortSleep && d.sleep !== null && d.sleep >= shortSleep.threshold);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(shiftIdx >= 0 ? shiftIdx : null);
  const activePoint = hoveredIdx !== null && days[hoveredIdx] ? days[hoveredIdx] : last(days);

  // ---- Chart A geometry: sleep line, normal range, change point ----
  const W = 640;
  const H = 220;
  const padL = 44;
  const padR = 20;
  const padT = 22;
  const padB = 30;
  const sleepVals = days.map((d) => d.sleep as number);
  const rawMinSleep = sleepVals.length
    ? Math.min(...sleepVals, shift?.normal_low_min ?? Infinity)
    : 300;
  const rawMaxSleep = sleepVals.length
    ? Math.max(...sleepVals, shift?.normal_high_min ?? -Infinity)
    : 540;
  const minSleep = Math.floor((rawMinSleep - 20) / 60) * 60;
  const maxSleep = Math.max(minSleep + 60, Math.ceil((rawMaxSleep + 20) / 60) * 60);
  const sx = (i: number) => padL + (i / Math.max(1, days.length - 1)) * (W - padL - padR);
  const sy = (val: number) => padT + ((maxSleep - val) / Math.max(1, maxSleep - minSleep)) * (H - padT - padB);
  const linePath = days
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.sleep as number).toFixed(1)}`)
    .join(' ');
  const areaPath = days.length
    ? `${linePath} L ${sx(days.length - 1).toFixed(1)} ${H - padB} L ${sx(0).toFixed(1)} ${H - padB} Z`
    : '';
  const gridLines: number[] = [];
  for (let m = minSleep; m <= maxSleep; m += 60) gridLines.push(m);
  const labelEvery = Math.max(1, Math.round(days.length / 7));

  // ---- Chart B: sleep vs water scatter ----
  const scatterDays = days.filter((d) => d.water !== null);
  const waterVals = scatterDays.map((d) => d.water as number);
  const rawWMin = waterVals.length ? Math.min(...waterVals, lowWater?.threshold ?? Infinity) : 0;
  const rawWMax = waterVals.length ? Math.max(...waterVals) : 3000;
  const wMin = Math.floor(rawWMin / 250) * 250;
  const wMax = Math.max(wMin + 250, Math.ceil(rawWMax / 250) * 250);
  const SX0 = 44;
  const SX1 = 358;
  const SY0 = 20;
  const SY1 = 192;
  const px = (sleep: number) => SX0 + ((sleep - minSleep) / Math.max(1, maxSleep - minSleep)) * (SX1 - SX0);
  const py = (water: number) => SY1 - ((water - wMin) / Math.max(1, wMax - wMin)) * (SY1 - SY0);

  // ---- Card C: weekly late screen time ----
  const screenWeeks = screen.weeks.slice(-10);
  const screenMax = Math.max(1, ...screenWeeks.map((w) => w.avg_min));

  const kpis: Array<{ icon: React.ReactNode; label: string; value: string; sub: string; accent: string; rec?: string | null }> = [
    {
      icon: <Moon className="w-4 h-4 text-change" />,
      label: 'SLEEP SHIFT',
      value: shift ? `${shift.delta_min} min` : 'None yet',
      sub: shift
        ? `${hm(shift.before_median_min)} normal → ${hm(shift.after_median_min)} from ${shortDate(shift.date)}`
        : 'No sleep change detected so far',
      accent: 'var(--change)',
      rec: shift?.record_ids[0],
    },
    {
      icon: <Flame className="w-4 h-4 text-ok" />,
      label: 'TOP HEADACHE DRIVER',
      value: topHyp?.k != null && topHyp.n != null ? `${topHyp.k} of ${topHyp.n}` : 'Not enough data',
      sub: topHyp ? `${topHyp.label}: ${topHyp.claim.replace(/^\d+ of \d+ /, '')}` : 'Log a few more days',
      accent: 'var(--ok)',
      rec: topHyp?.record_ids[0],
    },
    {
      icon: <Lock className="w-4 h-4 text-branchOpen" />,
      label: 'LOCKED EXPERIMENT',
      value: experiment ? `${experiment.adherence_pct}%` : 'None',
      sub: experiment
        ? `adherence · night ${experiment.days_elapsed} of ${experiment.duration_days}`
        : 'No locked experiment yet',
      accent: 'var(--branch-open)',
      rec: last(experiment?.nights.filter((n) => n.record_id) ?? [])?.record_id,
    },
    {
      icon: <Sparkles className="w-4 h-4 text-subCyan" />,
      label: 'VERIFIED KNOWLEDGE',
      value: `${insights.knowledge_count} Verified`,
      sub: 'Decided in Python against a locked criterion',
      accent: 'var(--sub-cyan)',
    },
  ];

  const insightFeed = useMemo(() => {
    const feed: Array<{
      id: string;
      type: 'change' | 'relationship' | 'experiment';
      badge: string;
      color: string;
      title: string;
      detail: string;
      records: string[];
      branchId?: string;
    }> = [];
    if (shift) {
      feed.push({
        id: shift.change_event_id,
        type: 'change',
        badge: 'CHANGE POINT · PELT',
        color: 'var(--change)',
        title: `Sleep dropped ${Math.abs(shift.delta_min)} min starting ${shortDate(shift.date)}`,
        detail: `Median ${hm(shift.before_median_min)} over the ${shift.baseline_days ?? 30} days before, ${hm(
          shift.after_median_min
        )} over the next ${shift.post_window_days} days.`,
        records: shift.record_ids.slice(0, 4),
        branchId: focusBranchId,
      });
    }
    for (const h of focusHyps) {
      if (h.k == null || h.n == null) continue;
      feed.push({
        id: `${h.branch_id}-${h.rank}`,
        type: 'relationship',
        badge: h.rank === 1 ? 'PATTERN · PYTHON VERIFIED' : `HYPOTHESIS #${h.rank}`,
        color: h.rank === 1 ? 'var(--ok)' : 'var(--amb)',
        title: h.claim,
        detail: `${h.label}: ${h.confidence}% confidence. ${h.j} of ${h.m} days without the symptom also had ${h.exposure_text}.`,
        records: h.record_ids.slice(0, 4),
        branchId: h.branch_id,
      });
    }
    for (const k of graph?.knowledge ?? []) {
      const branch = graph?.branches.find((b) => b.status === 'concluded' && b.end_date === k.date);
      feed.push({
        id: k.id,
        type: 'experiment',
        badge: 'VERIFIED KNOWLEDGE · SOLVED',
        color: 'var(--branch-open)',
        title: k.statement,
        detail: `Concluded ${shortDate(k.date)} by a locked experiment · ${k.confidence} confidence.`,
        records: [],
        branchId: branch?.id,
      });
    }
    return feed;
  }, [shift, focusHyps, focusBranchId, graph]);

  const visibleFeed = insightFeed.filter((item) => filterType === 'all' || item.type === filterType);

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-7 space-y-6">
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-branchOpen">
            Deterministic Python Analytics · As of {shortDate(insights.as_of)}
          </div>
          <h1 className="mt-1 font-serif text-[28px] text-t1 leading-tight">
            Personal Health Insights &amp; Evidence Charts
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onOpenGraphBranch(focusBranchId)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
        >
          <span>Inspect on Living Root Graph</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* 1. KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((card) => (
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
              {card.rec && (
                <button
                  type="button"
                  onClick={() => onOpenRecord(card.rec as string, 'raw')}
                  className="font-mono text-[10px] font-semibold text-evi hover:underline shrink-0"
                >
                  {card.rec}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 2. SLEEP CHART + SLEEP/WATER SCATTER */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
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
                Sleep, last {days.length} days, vs your normal range
              </h2>
            </div>

            {activePoint && (
              <div
                className="px-3 py-1.5 rounded-xl font-mono text-[10.5px] flex items-center gap-2.5"
                style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border-strong)' }}
              >
                <span className="text-t1 font-bold">{shortDate(activePoint.date)}</span>
                <span className="text-branchOpen">{hm(activePoint.sleep as number)}</span>
                {activePoint.headache && (
                  <span className="text-change font-bold">
                    {isCounterexample(activePoint) ? 'Headache · counterexample' : 'Headache'}
                  </span>
                )}
                {activePoint.sleep_id && (
                  <button
                    type="button"
                    onClick={() => onOpenRecord(activePoint.sleep_id as string, 'raw')}
                    className="text-evi underline"
                  >
                    {activePoint.sleep_id}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 w-full overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[225px]">
              <defs>
                <linearGradient id="sleepAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--trunk)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--trunk)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {gridLines.map((m) => (
                <g key={m}>
                  <line x1={padL} y1={sy(m)} x2={W - padR} y2={sy(m)} stroke="var(--border)" strokeDasharray="3 4" />
                  <text x={padL - 8} y={sy(m) + 3.5} textAnchor="end" fill="var(--t3)" fontSize="9.5" fontFamily={MONO}>
                    {m / 60}h
                  </text>
                </g>
              ))}

              {/* Normal range: 30-day median ± 2 MAD, exactly what the change detector uses */}
              {shift?.normal_low_min != null && shift.normal_high_min != null && shift.normal_median_min != null && (
                <>
                  <rect
                    x={padL}
                    y={sy(shift.normal_high_min)}
                    width={W - padL - padR}
                    height={sy(shift.normal_low_min) - sy(shift.normal_high_min)}
                    fill="var(--ok)"
                    fillOpacity={0.09}
                  />
                  <line
                    x1={padL}
                    y1={sy(shift.normal_median_min)}
                    x2={W - padR}
                    y2={sy(shift.normal_median_min)}
                    stroke="var(--ok)"
                    strokeOpacity={0.45}
                    strokeDasharray="5 4"
                  />
                </>
              )}

              {shift && shiftIdx >= 0 && (
                <>
                  <line x1={sx(shiftIdx)} y1={padT} x2={sx(shiftIdx)} y2={H - padB} stroke="var(--change)" strokeWidth="1.5" strokeDasharray="4 3" />
                  <rect
                    x={sx(shiftIdx) - 52}
                    y={padT - 14}
                    width="104"
                    height="18"
                    rx="9"
                    fill="rgba(255, 77, 109, 0.16)"
                    stroke="var(--change)"
                    strokeWidth="0.8"
                  />
                  <text x={sx(shiftIdx)} y={padT - 2} textAnchor="middle" fill="var(--change)" fontSize="8.5" fontWeight="700" fontFamily={MONO}>
                    SHIFT: {shortDate(shift.date).toUpperCase()} ({shift.delta_min}m)
                  </text>
                </>
              )}

              <path d={areaPath} fill="url(#sleepAreaGrad)" />
              <path d={linePath} fill="none" stroke="var(--branch-open)" strokeWidth="2.5" strokeLinejoin="round" />

              {days.map((p, i) => {
                const isSelected = hoveredIdx === i;
                const fill = isCounterexample(p) ? 'var(--amb)' : p.headache ? 'var(--change)' : 'var(--branch-open)';
                return (
                  <g
                    key={p.date}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onClick={() => p.sleep_id && onOpenRecord(p.sleep_id, 'raw')}
                  >
                    <circle cx={sx(i)} cy={sy(p.sleep as number)} r={10} fill="transparent" />
                    <circle
                      cx={sx(i)}
                      cy={sy(p.sleep as number)}
                      r={isSelected ? 6 : p.headache ? 4.8 : 3.2}
                      fill={fill}
                      stroke="var(--bg)"
                      strokeWidth="1.8"
                    />
                    {i % labelEvery === 0 && (
                      <text x={sx(i)} y={H - 8} textAnchor="middle" fill="var(--t3)" fontSize="9" fontFamily={MONO}>
                        {shortDate(p.date)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-t3">
            <span>Hover a point to inspect · click to open the raw record</span>
            <div className="flex flex-wrap items-center gap-3">
              {shift?.normal_low_min != null && shift.normal_high_min != null && (
                <span className="flex items-center gap-1 text-ok">
                  ▬ Normal before {shortDate(shift.date)}: {hm(shift.normal_low_min)}–{hm(shift.normal_high_min)}
                </span>
              )}
              <span className="flex items-center gap-1 text-change">● Headache day</span>
              <span className="flex items-center gap-1 text-amb">
                ● Headache after {shortSleep ? hm(shortSleep.threshold) : '6h'}+ sleep
              </span>
            </div>
          </div>
        </div>

        <div
          className="xl:col-span-5 rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-subCyan">
              <Droplets className="w-3.5 h-3.5" />
              <span>MULTI-SIGNAL TRIGGER SEPARATION</span>
            </div>
            <h2 className="mt-1 text-[16px] font-semibold text-t1">Sleep vs. Water, last {scatterDays.length} days</h2>
            <p className="text-[11.5px] text-t3 mt-0.5">
              Shaded: {shortSleep?.exposure_text ?? 'short sleep'} and {lowWater?.exposure_text ?? 'low water'}. Red
              dots are headache days.
            </p>
          </div>

          <svg viewBox="0 0 380 225" className="w-full h-[220px] mt-3">
            {shortSleep && lowWater && (
              <rect
                x={SX0}
                y={py(lowWater.threshold)}
                width={Math.max(0, px(shortSleep.threshold) - SX0)}
                height={Math.max(0, SY1 - py(lowWater.threshold))}
                rx="6"
                fill="rgba(255, 77, 109, 0.10)"
                stroke="rgba(255, 77, 109, 0.35)"
                strokeDasharray="4 3"
              />
            )}
            <line x1={SX0} y1={SY1} x2={SX1} y2={SY1} stroke="var(--border-strong)" />
            <line x1={SX0} y1={SY0} x2={SX0} y2={SY1} stroke="var(--border-strong)" />
            {shortSleep && (
              <>
                <line x1={px(shortSleep.threshold)} y1={SY0} x2={px(shortSleep.threshold)} y2={SY1} stroke="var(--border)" strokeDasharray="3 4" />
                <text x={px(shortSleep.threshold)} y="208" textAnchor="middle" fill="var(--t3)" fontSize="9" fontFamily={MONO}>
                  {hm(shortSleep.threshold)} sleep
                </text>
              </>
            )}
            <text x={SX1} y="208" textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily={MONO}>
              {hm(maxSleep)} →
            </text>
            <text x={SX0 - 6} y={SY0 + 4} textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily={MONO}>
              {(wMax / 1000).toFixed(1)}L
            </text>
            {lowWater && (
              <text x={SX0 - 6} y={py(lowWater.threshold) + 3} textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily={MONO}>
                {(lowWater.threshold / 1000).toFixed(1)}L
              </text>
            )}
            {/* Skip the bottom label when the threshold label would sit on top of it. */}
            {(!lowWater || SY1 - py(lowWater.threshold) > 14) && (
              <text x={SX0 - 6} y={SY1} textAnchor="end" fill="var(--t3)" fontSize="9" fontFamily={MONO}>
                {(wMin / 1000).toFixed(1)}L
              </text>
            )}

            {scatterDays.map((d) => {
              const col = isCounterexample(d) ? 'var(--amb)' : d.headache ? 'var(--change)' : 'var(--branch-open)';
              return (
                <g
                  key={d.date}
                  className="cursor-pointer"
                  onClick={() => d.sleep_id && onOpenRecord(d.sleep_id, 'raw')}
                >
                  <title>
                    {shortDate(d.date)}: {hm(d.sleep as number)} sleep, {(d.water as number).toLocaleString()} ml water
                    {d.headache ? ', headache' : ''}
                  </title>
                  <circle
                    cx={px(d.sleep as number)}
                    cy={py(d.water as number)}
                    r={d.headache ? 7 : 5}
                    fill={col}
                    fillOpacity={d.headache ? 0.85 : 0.55}
                    stroke="var(--bg)"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* 3. SCREEN TIME + EVIDENCE STRENGTH + EXPERIMENT NIGHTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div
          className="rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-amb">
              <MonitorSmartphone className="w-3.5 h-3.5" />
              <span>UPSTREAM DRIVER · LATE SCREEN TIME</span>
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-t1">Screen minutes after 10 PM, per week</h3>
          </div>
          <svg viewBox="0 0 260 180" className="w-full h-[180px] my-2">
            {screenWeeks.map((w, i) => {
              const slot = 236 / screenWeeks.length;
              const bh = (w.avg_min / screenMax) * 130;
              const x = 14 + i * slot + 3;
              // Red from the week that contains the sleep change onwards.
              const hot = shift ? addDays(w.week_start, 6) >= shift.date : false;
              return (
                <g key={w.week_start}>
                  <title>
                    Week of {shortDate(w.week_start)}: {w.avg_min} min a night ({w.days} nights)
                  </title>
                  <rect
                    x={x}
                    y={150 - bh}
                    width={slot - 6}
                    height={bh}
                    rx="3"
                    fill={hot ? 'var(--change)' : 'var(--branch-open)'}
                    fillOpacity={hot ? 0.8 : 0.5}
                  />
                  <text x={x + (slot - 6) / 2} y={145 - bh} textAnchor="middle" fill="var(--t2)" fontSize="8.5" fontFamily={MONO}>
                    {w.avg_min}
                  </text>
                  {(screenWeeks.length - 1 - i) % 2 === 0 && (
                    <text x={x + (slot - 6) / 2} y="166" textAnchor="middle" fill="var(--t3)" fontSize="8" fontFamily={MONO}>
                      {shortDate(w.week_start)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="font-mono text-[10px] text-t3">
            {screen.before_avg_min != null && screen.after_avg_min != null && shift
              ? `Average ${screen.before_avg_min} min a night before ${shortDate(shift.date)}, ${screen.after_avg_min} min since.`
              : 'Not enough screen-time data yet.'}
          </p>
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="font-mono text-[10px] text-hyp">EVIDENCE STRENGTH</div>
            <h3 className="mt-1 text-[15px] font-semibold text-t1">How well each explanation fits</h3>
            <p className="text-[11px] text-t3 mt-0.5">
              Confidence = share of symptom days with the trigger, minus share of other days with it.
            </p>
          </div>

          <div className="space-y-3 my-3">
            {hypotheses.map((h) => {
              const col = h.confidence >= 50 ? 'var(--ok)' : h.confidence >= 30 ? 'var(--amb)' : 'var(--change)';
              return (
                <div key={`${h.branch_id}-${h.rank}`} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="font-medium text-t1 truncate">{h.label}</span>
                    <button
                      type="button"
                      disabled={!h.record_ids[0]}
                      onClick={() => h.record_ids[0] && onOpenRecord(h.record_ids[0], 'raw')}
                      className="font-mono text-[10px] text-t2 hover:text-evi shrink-0"
                    >
                      {h.k != null ? `${h.k}/${h.n} vs ${h.j}/${h.m} · ` : ''}
                      <strong style={{ color: col }}>{h.confidence}%</strong>
                    </button>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--s2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${h.confidence}%`, backgroundColor: col }} />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="font-mono text-[9.5px] text-t3">
            {[...new Set(hypotheses.map((h) => h.branch_title))].join(' · ')}
          </p>
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col justify-between"
          style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
        >
          {experiment ? (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-branchOpen">
                    LOCKED EXPERIMENT · {experiment.id.toUpperCase()}
                  </span>
                  <Lock className="w-3.5 h-3.5 text-branchOpen" />
                </div>
                <h3 className="mt-1 font-serif italic text-[17px] text-t1">
                  {experiment.description} ({experiment.duration_days} nights)
                </h3>
                <p className="mt-0.5 font-mono text-[10px] text-t3">Criterion: {experiment.success_criterion}</p>
              </div>

              <div className="grid grid-cols-5 gap-2 my-4">
                {experiment.nights.map((n, i) => (
                  <button
                    key={n.date}
                    type="button"
                    disabled={!n.record_id}
                    onClick={() => n.record_id && onOpenRecord(n.record_id, 'raw')}
                    title={`${shortDate(n.date)}${n.value != null ? `: ${hm(n.value)}` : ': not yet'}`}
                    className="rounded-lg p-2 text-center"
                    style={{
                      backgroundColor:
                        n.met === true ? 'rgba(16, 185, 129, 0.16)' : n.met === false ? 'rgba(255, 77, 109, 0.14)' : 'var(--s2)',
                      border:
                        n.met === true
                          ? '1px solid rgba(16, 185, 129, 0.45)'
                          : n.met === false
                          ? '1px solid rgba(255, 77, 109, 0.35)'
                          : '1px dashed var(--border)',
                    }}
                  >
                    <div className="font-mono text-[9.5px] text-t3">N{i + 1}</div>
                    <div
                      className="mt-0.5 font-mono text-[11px] font-bold"
                      style={{ color: n.met === true ? 'var(--ok)' : n.met === false ? 'var(--change)' : 'var(--t3)' }}
                    >
                      {n.value == null ? '—' : `${(n.value / 60).toFixed(1)}h`}
                    </div>
                  </button>
                ))}
              </div>

              <div
                className="rounded-xl px-3 py-2 flex items-center justify-between font-mono text-[10.5px]"
                style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
              >
                <span className="text-t2">
                  {experiment.nights_met} of {experiment.nights_logged} nights met target
                </span>
                <span className="text-ok font-bold capitalize">
                  {experiment.status === 'active' ? `Running · ${experiment.adherence_pct}% adherence` : experiment.status.replace('_', ' ')}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-t3">No locked experiment yet. Lock one from an investigation.</p>
          )}
        </div>
      </div>

      {/* 4. FINDINGS FEED */}
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
          {visibleFeed.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl p-4 flex flex-col justify-between gap-3"
              style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold" style={{ color: item.color }}>
                    {item.type === 'change' ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {item.badge}
                  </span>
                  {item.branchId && (
                    <button
                      type="button"
                      onClick={() => onOpenGraphBranch(item.branchId as string)}
                      className="font-mono text-[10px] text-branchOpen hover:underline"
                    >
                      View on Graph →
                    </button>
                  )}
                </div>
                <h3 className="mt-2 text-[14.5px] font-semibold text-t1">{item.title}</h3>
                <p className="mt-1 text-[12px] text-t2 leading-relaxed">{item.detail}</p>
              </div>

              {item.records.length > 0 && (
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
              )}
            </div>
          ))}
          {visibleFeed.length === 0 && (
            <p className="text-[12px] text-t3">Nothing in this category yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
