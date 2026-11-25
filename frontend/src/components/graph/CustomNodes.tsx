import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CheckCircle2, FileText, GitMerge, Lock, Sparkles, TestTube2 } from 'lucide-react';

export const AnchorNode: React.FC<NodeProps> = () => (
  <div className="w-2 h-2 relative pointer-events-none">
    <Handle type="source" position={Position.Right} className="!opacity-0 !w-1 !h-1" />
    <Handle type="target" position={Position.Left} className="!opacity-0 !w-1 !h-1" />
  </div>
);

export const ChangeEventNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    label: string;
    dateLabel: string;
    spotlight?: boolean;
    animateIn?: boolean;
    onClick?: () => void;
  };
  return (
    <button
      type="button"
      onClick={d.onClick}
      className={`group relative w-8 h-8 flex items-center justify-center cursor-pointer focus:outline-none ${
        d.animateIn ? 'node-sprout' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <span
        className="change-pulse-ring absolute inset-0 rounded-full border"
        style={{ borderColor: 'var(--change)' }}
      />
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center ${
          d.spotlight ? 'scale-125 ring-2 ring-change' : ''
        }`}
        style={{
          backgroundColor: 'rgba(255, 77, 109, 0.28)',
          border: '1.5px solid var(--change)',
        }}
      >
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--change)' }} />
      </span>

      <span
        className={`absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-transform group-hover:scale-105 ${
          d.spotlight ? 'voice-spotlight' : ''
        }`}
        style={{
          color: 'var(--change)',
          backgroundColor: 'var(--s1)',
          border: '1px solid rgba(255, 77, 109, 0.45)',
        }}
      >
        {d.dateLabel} · {d.label}
      </span>
    </button>
  );
};

export const MeltConfluenceNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as { label: string; animateIn?: boolean; onClick?: () => void };
  return (
    <button
      type="button"
      onClick={d.onClick}
      title={d.label}
      className={`group relative w-8 h-8 flex items-center justify-center focus:outline-none ${
        d.animateIn ? 'node-sprout' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <div
        className="melt-knot-glow w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
        style={{ backgroundColor: 'var(--s1)', border: '2px solid var(--sub-emerald)' }}
      >
        <GitMerge className="w-3.5 h-3.5 text-subEmerald" />
      </div>

      <span
        className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] px-2 py-0.5 rounded-full opacity-90"
        style={{
          backgroundColor: 'var(--s1)',
          color: 'var(--sub-emerald)',
          border: '1px solid var(--border)',
        }}
      >
        {d.label}
      </span>
    </button>
  );
};

/**
 * SLEEK VERIFIED KNOWLEDGE NODE (Matches the abyssal teal instrumentation vibe — zero cartoon tree)
 * Sits cleanly at the end of a melted solved branch stem.
 */
export const KnowledgeNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    branchId: string;
    statement: string;
    dateLabel: string;
    confidence: string;
    recordIds: string[];
    isNew?: boolean;
    spotlight?: boolean;
    animateIn?: boolean;
    onSelectBranch: (id: string) => void;
    onOpenRecord: (id: string) => void;
  };

  return (
    <div className={`relative flex items-center gap-3 ${d.animateIn ? 'node-sprout' : ''}`}>
      <Handle type="target" position={Position.Left} className="!opacity-0" />

      {/* Sleek Bioluminescent Verified Emblem */}
      <button
        type="button"
        onClick={() => d.onSelectBranch(d.branchId)}
        className="relative w-11 h-11 rounded-full shrink-0 flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.16)',
          border: '2px solid var(--sub-emerald)',
          boxShadow: '0 0 22px var(--trunk-glow)',
        }}
        title="Solved Investigation — Verified Knowledge"
      >
        <Sparkles className="w-5 h-5 text-branchOpen" />
      </button>

      {/* Sleek Glassmorphic Knowledge Card */}
      <div
        className={`w-[264px] rounded-2xl p-3.5 text-left transition-all ${
          d.spotlight ? 'voice-spotlight' : d.isNew ? 'ring-2 ring-branchOpen' : ''
        }`}
        style={{
          backgroundColor: 'var(--s1)',
          border: '1.2px solid var(--sub-emerald)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.34)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9px] font-bold tracking-wide"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.16)', color: 'var(--ok)' }}
          >
            <CheckCircle2 className="w-2.5 h-2.5" />
            VERIFIED KNOWLEDGE
          </span>
          <span className="font-mono text-[9.5px] text-t3">{d.dateLabel}</span>
        </div>

        <button
          type="button"
          onClick={() => d.onSelectBranch(d.branchId)}
          className="mt-2 block text-left font-serif italic text-[14.5px] text-t1 leading-snug hover:text-branchOpen transition-colors"
        >
          {d.statement}
        </button>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {d.recordIds.map((rid) => (
              <button
                key={rid}
                type="button"
                onClick={() => d.onOpenRecord(rid)}
                className="px-1.5 py-0.5 rounded-md font-mono text-[9.5px] font-semibold transition-transform hover:scale-105"
                style={{
                  backgroundColor: 'var(--bg)',
                  color: 'var(--evi)',
                  border: '1px solid rgba(56, 189, 248, 0.42)',
                }}
              >
                {rid}
              </button>
            ))}
          </div>
          <span className="font-mono text-[9.5px] text-ok">{d.confidence}</span>
        </div>
      </div>
    </div>
  );
};

export const BranchHubNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    id: string;
    title: string;
    status: 'open' | 'concluded' | 'inconclusive';
    branchType?: 'investigation' | 'habit';
    labelSide?: 'above' | 'below';
    subtitle: string;
    isSelected: boolean;
    spotlight?: boolean;
    animateIn?: boolean;
    onSelect: (id: string) => void;
  };
  const isOpen = d.status === 'open';
  const isHabit = d.branchType === 'habit';
  const ringColor = isHabit
    ? 'var(--sub-cyan)'
    : isOpen
    ? 'var(--branch-open)'
    : 'var(--sub-emerald)';

  const labelPosClass =
    d.labelSide === 'above'
      ? 'bottom-9 left-1/2 -translate-x-1/2'
      : 'top-9 left-1/2 -translate-x-1/2';

  return (
    <div className={`relative w-7 h-7 flex items-center justify-center ${d.animateIn ? 'node-sprout' : ''}`}>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <button
        type="button"
        onClick={() => d.onSelect(d.id)}
        className="group relative w-7 h-7 flex items-center justify-center focus:outline-none"
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
          style={{
            backgroundColor: 'var(--s1)',
            border: `2.2px solid ${ringColor}`,
            boxShadow: isOpen ? '0 0 18px var(--trunk-glow)' : 'none',
          }}
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ringColor }} />
        </span>

        <div
          className={`absolute ${labelPosClass} rounded-2xl px-4 py-2.5 text-left transition-all duration-200 group-hover:-translate-y-0.5 whitespace-nowrap ${
            d.spotlight ? 'voice-spotlight' : ''
          }`}
          style={{
            backgroundColor: 'var(--s1)',
            border: d.isSelected ? `1.5px solid ${ringColor}` : '1px solid var(--border-strong)',
            boxShadow: d.isSelected ? '0 0 24px var(--trunk-glow)' : '0 6px 20px rgba(0,0,0,0.28)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ringColor }} />
            <span className="font-serif italic text-[14.5px] text-t1 leading-tight">{d.title}</span>
          </div>
          <p className="mt-0.5 font-mono text-[9.5px] text-t3 pl-4">{d.subtitle}</p>
        </div>
      </button>
    </div>
  );
};

export const SubHypothesisNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    rank: number;
    label: string;
    confidence?: number;
    detail: string;
    tone: 'emerald' | 'cyan' | 'muted' | 'solved';
    compact?: boolean;
    spotlight?: boolean;
    animateIn?: boolean;
    onClick: () => void;
  };

  const accentMap = {
    emerald: { border: 'rgba(16, 185, 129, 0.55)', text: 'var(--ok)', dot: 'var(--ok)' },
    cyan: { border: 'rgba(56, 189, 248, 0.45)', text: 'var(--amb)', dot: 'var(--sub-cyan)' },
    muted: { border: 'var(--border)', text: 'var(--change)', dot: 'var(--t3)' },
    solved: { border: 'rgba(16, 185, 129, 0.42)', text: 'var(--sub-emerald)', dot: 'var(--sub-emerald)' },
  };
  const accent = accentMap[d.tone];

  return (
    <button
      type="button"
      onClick={d.onClick}
      className={`relative flex items-center gap-2 text-left group focus:outline-none ${
        d.animateIn ? 'node-sprout' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />

      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: accent.dot, boxShadow: `0 0 8px ${accent.dot}` }}
      />
      <div
        className={`${d.compact ? 'w-[164px] px-3 py-1.5' : 'w-[196px] px-3.5 py-2'} rounded-2xl transition-all group-hover:translate-x-0.5 ${
          d.spotlight ? 'voice-spotlight' : ''
        }`}
        style={{ backgroundColor: 'var(--s2)', border: `1px solid ${accent.border}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`${d.compact ? 'text-[11.5px]' : 'text-[12.5px]'} font-semibold text-t1 truncate`}>
            {d.compact ? d.label : `${d.rank}. ${d.label}`}
          </span>
          <span
            className="shrink-0 font-mono text-[10.5px]"
            style={{ color: d.confidence === undefined ? 'var(--t3)' : accent.text }}
          >
            {d.confidence === undefined ? 'Unscored' : `${d.confidence}%`}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[9px] text-t3 truncate">{d.detail}</p>
      </div>
    </button>
  );
};

export const ExperimentLeafNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    description: string;
    adherence: number;
    locked: boolean;
    isDraft?: boolean;
    spotlight?: boolean;
    animateIn?: boolean;
    onClick: () => void;
  };
  return (
    <button
      type="button"
      onClick={d.onClick}
      className={`relative text-left group focus:outline-none ${d.animateIn ? 'node-sprout' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div
        className={`w-[218px] rounded-2xl px-3.5 py-2 transition-all group-hover:-translate-y-0.5 ${
          d.spotlight ? 'voice-spotlight' : ''
        }`}
        style={{
          backgroundColor: 'var(--s1)',
          border: d.isDraft ? '1px dashed var(--sub-cyan)' : '1.2px solid var(--branch-open)',
          boxShadow: '0 0 18px var(--ambient-glow)',
        }}
      >
        <div className="flex items-center gap-1.5 font-mono text-[9px] font-semibold text-branchOpen">
          {d.isDraft ? <TestTube2 className="w-3 h-3 text-subCyan" /> : <Lock className="w-3 h-3" />}
          <span>{d.isDraft ? 'PROPOSED TEST' : `EXPERIMENT · ${d.adherence}%`}</span>
        </div>
        <p className="mt-0.5 font-serif italic text-[12.5px] text-t1 leading-snug">{d.description}</p>
      </div>
    </button>
  );
};

export const EvidenceDewdropNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    recordId: string;
    summary: string;
    spotlight?: boolean;
    animateIn?: boolean;
    onOpenRecord: (id: string) => void;
  };
  return (
    <button
      type="button"
      onClick={() => d.onOpenRecord(d.recordId)}
      className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-transform hover:scale-105 focus:outline-none ${
        d.spotlight ? 'voice-spotlight' : ''
      } ${d.animateIn ? 'node-sprout' : ''}`}
      style={{
        backgroundColor: 'var(--s1)',
        border: '1px solid rgba(56, 189, 248, 0.48)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
      }}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <FileText className="w-3 h-3 text-evi shrink-0" />
      <span className="font-mono text-[9.5px] font-bold text-evi">{d.recordId}</span>
      <span className="font-mono text-[9.5px] text-t2">{d.summary}</span>
    </button>
  );
};
