import React from 'react';
import { BaseEdge, type EdgeProps } from '@xyflow/react';

export interface RootEdgeData extends Record<string, unknown> {
  kind:
    | 'trunk'
    | 'branch-open'
    | 'branch-concluded'
    | 'branch-habit'
    | 'sub-emerald'
    | 'sub-cyan'
    | 'sub-muted'
    | 'sub-exp'
    | 'melt-converge'
    | 'knowledge-stem'
    | 'evidence-tendril'
    | 'cross-mycelium';
  animateFlow?: boolean;
  isNewStep?: boolean;
  dateTicks?: Array<{ x: number; label: string }>;
}

function buildSmoothRootSpine(x1: number, y1: number, x2: number, y2: number, amp = 5.5, phase = 0): string {
  const dist = Math.max(40, x2 - x1);
  const spans = Math.max(2, Math.min(7, Math.round(dist / 260)));
  const dx = (x2 - x1) / spans;
  let d = `M ${x1} ${y1}`;
  for (let i = 0; i < spans; i++) {
    const sx = x1 + i * dx;
    const ex = x1 + (i + 1) * dx;
    const dir = (i + phase) % 2 === 0 ? -1 : 1;
    const c1x = sx + dx * 0.35;
    const c1y = y1 + dir * amp;
    const c2x = sx + dx * 0.65;
    const c2y = y2 + dir * amp * 0.85;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${y2}`;
  }
  return d;
}

export const TrunkEdge: React.FC<EdgeProps> = ({ id, sourceX, sourceY, targetX, targetY, data }) => {
  const edgeData = data as RootEdgeData | undefined;
  const ticks = edgeData?.dateTicks ?? [];
  const animateFlow = edgeData?.animateFlow ?? true;

  const mainPath = buildSmoothRootSpine(sourceX, sourceY, targetX, targetY, 5.5, 0);
  const fiberTop = buildSmoothRootSpine(sourceX, sourceY - 2.3, targetX, targetY - 2.3, 4.2, 1);
  const fiberBot = buildSmoothRootSpine(sourceX, sourceY + 2.5, targetX, targetY + 2.5, 4.8, 0);

  const spanLen = Math.max(120, targetX - sourceX);
  const rootletCount = Math.max(3, Math.min(18, Math.floor(spanLen / 105)));
  const rootlets = Array.from({ length: rootletCount }, (_, i) => {
    const frac = 0.05 + (i / Math.max(1, rootletCount - 1)) * 0.9;
    const rx = sourceX + spanLen * frac;
    const side = i % 2 === 0 ? 1 : -1;
    const len = 14 + ((i * 19 + 7) % 22);
    const sway = (i % 3 === 0 ? 1 : -1) * (10 + (i % 4) * 4);
    return {
      id: `rl-${i}`,
      d: `M ${rx} ${sourceY + side * 2} C ${rx + sway * 0.3} ${sourceY + side * len * 0.48}, ${rx - sway * 0.2} ${sourceY + side * len * 0.8}, ${rx + sway} ${sourceY + side * len}`,
      opacity: 0.13 + (i % 3) * 0.035,
    };
  });

  return (
    <g>
      {/* Layered GPU-cheap bioluminescent aura (avoids SVG blur raster stutter during zoom) */}
      <path
        d={mainPath}
        fill="none"
        stroke="var(--trunk)"
        strokeWidth={26}
        strokeOpacity={0.055}
        strokeLinecap="round"
      />

      {rootlets.map((rl) => (
        <path
          key={rl.id}
          d={rl.d}
          fill="none"
          stroke="var(--trunk)"
          strokeWidth={1.3}
          strokeOpacity={rl.opacity}
          strokeLinecap="round"
        />
      ))}

      <path
        d={mainPath}
        fill="none"
        stroke="var(--trunk)"
        strokeWidth={18}
        strokeOpacity={0.13}
        strokeLinecap="round"
        
      />

      <path
        id={id}
        d={mainPath}
        fill="none"
        stroke="var(--trunk)"
        strokeWidth={8}
        strokeLinecap="round"
      />

      <path
        d={fiberTop}
        fill="none"
        stroke="var(--t1)"
        strokeOpacity={0.28}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d={fiberBot}
        fill="none"
        stroke="var(--sub-emerald)"
        strokeOpacity={0.34}
        strokeWidth={1.8}
        strokeLinecap="round"
      />

      {animateFlow && (
        <path
          d={mainPath}
          fill="none"
          stroke="var(--t1)"
          strokeOpacity={0.62}
          strokeWidth={2.2}
          strokeDasharray="16 164"
          strokeLinecap="round"
          className="sap-flow-trunk"
        />
      )}

      {ticks.map((tick) => (
        <g key={`${tick.label}-${tick.x}`}>
          <line
            x1={tick.x}
            y1={sourceY - 4}
            x2={tick.x}
            y2={sourceY + 12}
            stroke="var(--t3)"
            strokeOpacity={0.55}
            strokeWidth={1}
          />
          <text
            x={tick.x}
            y={sourceY + 26}
            textAnchor="middle"
            fill="var(--t3)"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
          >
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  );
};

export const OrganicBranchEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}) => {
  const edgeData = data as RootEdgeData | undefined;
  const kind = edgeData?.kind ?? 'branch-open';
  const animateFlow = edgeData?.animateFlow ?? true;
  const isNewStep = edgeData?.isNewStep ?? false;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  let path: string;
  if (kind === 'cross-mycelium') {
    const c1x = sourceX + dx * 0.45;
    const c1y = sourceY + dy * 0.15;
    const c2x = targetX - dx * 0.45;
    const c2y = targetY - dy * 0.15;
    path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
  } else if (kind === 'branch-open' || kind === 'branch-concluded' || kind === 'branch-habit') {
    const c1x = sourceX + Math.max(70, Math.abs(dx) * 0.56);
    const c1y = sourceY;
    const c2x = targetX - Math.max(70, Math.abs(dx) * 0.56);
    const c2y = targetY;
    path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
  } else if (kind === 'melt-converge') {
    const c1x = sourceX + dx * 0.58;
    const c1y = sourceY;
    const c2x = targetX - dx * 0.42;
    const c2y = targetY;
    path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
  } else if (kind === 'knowledge-stem') {
    // Sleek unified melted stem gliding straight into the Verified Knowledge node
    const c1x = sourceX + dx * 0.48;
    const c1y = sourceY;
    const c2x = targetX - dx * 0.48;
    const c2y = targetY;
    path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
  } else {
    const c1x = sourceX + dx * 0.52;
    const c1y = sourceY + dy * 0.05;
    const c2x = targetX - dx * 0.52;
    const c2y = targetY - dy * 0.05;
    path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
  }

  const styleMap: Record<
    string,
    { stroke: string; width: number; dash?: string; glow?: boolean; flow?: boolean; opacity?: number }
  > = {
    'branch-open': { stroke: 'var(--branch-open)', width: 5, glow: true, flow: true },
    'branch-concluded': { stroke: 'var(--trunk)', width: 4, glow: true, opacity: 0.85 },
    'branch-habit': { stroke: 'var(--sub-cyan)', width: 4.2, glow: true, flow: true },
    'sub-emerald': { stroke: 'var(--sub-emerald)', width: 2.8, glow: true, flow: true },
    'sub-cyan': { stroke: 'var(--sub-cyan)', width: 2.3, opacity: 0.9 },
    'sub-muted': { stroke: 'var(--t3)', width: 1.8, dash: '6 5', opacity: 0.85 },
    'sub-exp': { stroke: 'var(--branch-open)', width: 2.3, dash: '7 4', flow: true },
    'melt-converge': { stroke: 'var(--sub-emerald)', width: 2.6, glow: true, opacity: 0.9 },
    'knowledge-stem': { stroke: 'var(--sub-emerald)', width: 4.8, glow: true, flow: true },
    'evidence-tendril': { stroke: 'var(--evi)', width: 1.5, dash: '3 4', opacity: 0.78 },
    'cross-mycelium': { stroke: 'var(--hyp)', width: 2.0, dash: '6 5', glow: true, opacity: 0.78 },
  };

  const cfg = styleMap[kind] ?? styleMap['branch-open'];
  const showCollar =
    kind === 'branch-open' || kind === 'branch-concluded' || kind === 'branch-habit';

  return (
    <g>
      {cfg.glow && (
        <path
          d={path}
          fill="none"
          stroke={cfg.stroke}
          strokeWidth={cfg.width + 7}
          strokeOpacity={0.16}
          strokeLinecap="round"
        />
      )}

      {showCollar && (
        <circle cx={sourceX} cy={sourceY} r={6} fill={cfg.stroke} fillOpacity={0.45} />
      )}

      <BaseEdge
        id={id}
        path={path}
        className={isNewStep && !cfg.dash ? 'edge-grow' : undefined}
        style={{
          stroke: cfg.stroke,
          strokeWidth: cfg.width,
          strokeDasharray: cfg.dash,
          strokeOpacity: cfg.opacity ?? 1,
          strokeLinecap: 'round',
        }}
      />

      {(kind === 'branch-open' || kind === 'knowledge-stem') && (
        <path
          d={path}
          fill="none"
          stroke="var(--t1)"
          strokeOpacity={0.34}
          strokeWidth={1.1}
          strokeLinecap="round"
        />
      )}

      {animateFlow && cfg.flow && !isNewStep && (
        <path
          d={path}
          fill="none"
          stroke="var(--t1)"
          strokeOpacity={0.78}
          strokeWidth={1.8}
          strokeDasharray="10 170"
          strokeLinecap="round"
          className="sap-flow-branch"
        />
      )}
    </g>
  );
};
