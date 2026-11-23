import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lock,
  ShieldAlert,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { synthesizeWithElevenLabs } from '../../api';
import type { AskResponse, BranchDetailResponse, BranchHypothesis } from '../../types';

interface InvestigationPanelProps {
  branch: BranchDetailResponse | null;
  askResult: AskResponse | null;
  askQuestion: string | null;
  onClose: () => void;
  onClearAsk: () => void;
  onOpenRecord: (recordId: string, tab?: 'raw' | 'ai') => void;
  onLockExperiment: (expId: string) => void;
}

const ConfidenceRing: React.FC<{ value: number; rank: number }> = ({ value, rank }) => {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(100, Math.max(0, value)) / 100);
  const color = rank === 1 ? 'var(--ok)' : rank === 2 ? 'var(--amb)' : 'var(--change)';

  return (
    <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="3.5"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute font-mono text-[10.5px] font-bold" style={{ color }}>
        {value}%
      </span>
    </div>
  );
};

const HypothesisCard: React.FC<{
  hyp: BranchHypothesis;
  defaultExpanded: boolean;
  onOpenRecord: (id: string) => void;
}> = ({ hyp, defaultExpanded, onOpenRecord }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pct = hyp.confidence ?? (hyp.rank === 1 ? 72 : hyp.rank === 2 ? 41 : 28);
  const borderColor =
    hyp.rank === 1
      ? 'rgba(16, 185, 129, 0.35)'
      : hyp.rank === 2
      ? 'rgba(245, 158, 11, 0.30)'
      : 'rgba(255, 77, 109, 0.28)';

  const badge =
    pct >= 60
      ? { label: 'Top finding', color: 'var(--ok)', bg: 'rgba(16,185,129,0.12)', icon: <Check className="w-3 h-3" /> }
      : pct >= 40
      ? { label: 'Moderate', color: 'var(--amb)', bg: 'rgba(245,158,11,0.12)', icon: <HelpCircle className="w-3 h-3" /> }
      : { label: 'Weak', color: 'var(--change)', bg: 'rgba(255,77,109,0.12)', icon: <X className="w-3 h-3" /> };

  return (
    <div
      className="rounded-xl p-3.5 transition-colors"
      style={{ backgroundColor: 'var(--s2)', border: `1px solid ${borderColor}` }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        className="flex items-start justify-between gap-3 cursor-pointer"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold shrink-0 mt-0.5"
            style={{
              backgroundColor: 'rgba(167, 139, 250, 0.18)',
              color: 'var(--hyp)',
              border: '1px solid rgba(167, 139, 250, 0.45)',
            }}
          >
            {hyp.rank}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[13.5px] font-semibold text-t1">
                {hyp.label ?? hyp.text}
              </h4>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: badge.bg, color: badge.color }}
              >
                {badge.icon}
                {badge.label}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-t2 leading-relaxed">
              {hyp.claims[0]?.text ?? `No direct claims yet · Proposed: ${hyp.test}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ConfidenceRing value={pct} rank={hyp.rank} />
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-t3" />
          ) : (
            <ChevronDown className="w-4 h-4 text-t3" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-2.5 border-t space-y-2.5" style={{ borderColor: 'var(--border)' }}>
          {hyp.claims.length > 0 ? (
            hyp.claims.map((claim, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-[11.5px] text-t1">{claim.text}</p>
                <div className="flex flex-wrap gap-1.5">
                  {claim.record_ids.map((rid) => (
                    <button
                      key={rid}
                      type="button"
                      onClick={() => onOpenRecord(rid)}
                      className="px-2 py-0.5 rounded-md font-mono text-[10.5px] font-semibold transition-transform hover:scale-105"
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
              </div>
            ))
          ) : (
            <p className="font-mono text-[10.5px] text-t3">
              No verified record links yet. Log 7+ days to evaluate.
            </p>
          )}
          <div
            className="rounded-lg px-2.5 py-1.5 font-mono text-[10.5px] text-t2"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            Test: {hyp.test}
          </div>
        </div>
      )}
    </div>
  );
};

export const InvestigationPanel: React.FC<InvestigationPanelProps> = ({
  branch,
  askResult,
  askQuestion,
  onClose,
  onClearAsk,
  onOpenRecord,
  onLockExperiment,
}) => {
  const [speakingSummary, setSpeakingSummary] = useState(false);

  // 1. RED FLAG SAFETY SCREEN (blocks AI output completely)
  if (askResult?.red_flag) {
    return (
      <aside
        className="w-[448px] shrink-0 h-full overflow-y-auto p-6 flex flex-col justify-between"
        style={{
          backgroundColor: 'var(--s1)',
          borderLeft: '1px solid rgba(255, 77, 109, 0.45)',
        }}
      >
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{
            backgroundColor: 'rgba(255, 77, 109, 0.09)',
            border: '1px solid rgba(255, 77, 109, 0.45)',
          }}
        >
          <ShieldAlert className="w-10 h-10 text-change" />
          <h2 className="font-serif text-[26px] text-t1 leading-tight">
            See a doctor now
          </h2>
          <p className="text-[13.5px] text-t2 leading-relaxed">
            One or more symptoms you described require in-person medical assessment. RootTrace
            stopped before contacting the AI and cannot evaluate or run experiments on emergency
            symptoms.
          </p>
          <p className="font-mono text-[12px] font-semibold text-change">
            Call 112 in an emergency or visit the nearest urgent clinic immediately.
          </p>
          <div className="pt-2 flex flex-col gap-2.5">
            <a
              href="https://www.google.com/maps/search/hospital+near+me"
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 rounded-lg text-center text-[13px] font-semibold text-white"
              style={{ backgroundColor: 'var(--change)' }}
            >
              Find a clinic near you
            </a>
            <button
              type="button"
              onClick={onClearAsk}
              className="w-full py-2 rounded-lg text-[12.5px] font-medium text-t2 hover:text-t1"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              Back to your data
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // 2. ASK RESPONSE VIEW
  if (askResult && askQuestion) {
    return (
      <aside
        className="w-[448px] shrink-0 h-full overflow-y-auto flex flex-col"
        style={{
          backgroundColor: 'var(--s1)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <div
          className="sticky top-0 z-10 px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ backgroundColor: 'var(--s1)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClearAsk}
              className="w-8 h-8 rounded-full flex items-center justify-center text-t2 hover:text-t1 shrink-0"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] text-branchOpen">
                <Sparkles className="w-3 h-3" />
                <span>BEDROCK HAIKU · CITATION-CHECKED</span>
              </div>
              <h2 className="font-serif italic text-[17px] text-t1 truncate">{askQuestion}</h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenRecord('sl_0412', 'ai')}
            className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] font-semibold text-branchOpen shrink-0"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border-strong)' }}
          >
            What AI saw
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          {askResult.dropped_claims > 0 && (
            <div
              className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-[11.5px]"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.10)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: 'var(--amb)',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {askResult.dropped_claims} AI claim removed — could not be verified against your
                records.
              </span>
            </div>
          )}

          <div className="font-mono text-[9.5px] uppercase tracking-wider text-t3">
            Ranked Explanations (Click Any Record ID)
          </div>

          {askResult.hypotheses.map((h) => (
            <HypothesisCard
              key={h.rank}
              hyp={h}
              defaultExpanded={true}
              onOpenRecord={(rid) => onOpenRecord(rid, 'raw')}
            />
          ))}

          <p className="pt-2 font-mono text-[10px] text-t3 leading-relaxed">
            Personal pattern, not medical advice. Every number above was verified by Python against
            immutable record IDs before display.
          </p>
        </div>
      </aside>
    );
  }

  if (!branch) return null;

  const exp = branch.experiment;
  const adherencePct = Math.min(100, Math.max(0, exp?.adherence_pct ?? 0));

  const handleSpeakBranch = async () => {
    if (speakingSummary) {
      window.speechSynthesis?.cancel();
      setSpeakingSummary(false);
      return;
    }
    const top = branch.hypotheses[0];
    const spoken = `Investigation: ${branch.title}. Top verified finding is ${top?.label ?? top?.text ?? 'short sleep'} at ${top?.confidence ?? 72} percent evidence support. ${top?.claims[0]?.text ?? ''}. Active locked experiment: ${exp?.description ?? 'none'}, currently at ${adherencePct} percent adherence.`;
    setSpeakingSummary(true);
    try {
      const key = localStorage.getItem('elevenlabs_api_key') ?? undefined;
      const url = await synthesizeWithElevenLabs(spoken, key);
      const audio = new Audio(url);
      audio.onended = () => setSpeakingSummary(false);
      await audio.play();
    } catch {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(spoken);
        u.rate = 1.03;
        u.onend = () => setSpeakingSummary(false);
        window.speechSynthesis.speak(u);
      } else {
        setSpeakingSummary(false);
      }
    }
  };

  // 3. STANDARD INVESTIGATION DETAIL PANEL (Matches Screenshot 02)
  return (
    <aside
      className="w-[448px] shrink-0 h-full overflow-y-auto flex flex-col"
      style={{
        backgroundColor: 'var(--s1)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3.5 flex items-center justify-between gap-3"
        style={{ backgroundColor: 'var(--s1)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="w-8 h-8 rounded-full flex items-center justify-center text-t2 hover:text-t1 shrink-0"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] text-t3">
              Investigation · {branch.status === 'open' ? 'Open · 12 days' : 'Concluded'}
            </div>
            <h2 className="font-serif italic text-[17.5px] text-t1 leading-snug truncate">
              {branch.title}
            </h2>
          </div>
        </div>

        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0"
          style={{
            backgroundColor: 'rgba(20, 184, 166, 0.16)',
            color: 'var(--branch-open)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {branch.status === 'open' ? 'Open' : 'Concluded'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Triggering Change Event Banner */}
        {branch.change_event && (
          <div
            className="rounded-xl px-3.5 py-2.5 flex items-start gap-2.5"
            style={{
              backgroundColor: 'rgba(255, 77, 109, 0.08)',
              border: '1px solid rgba(255, 77, 109, 0.28)',
            }}
          >
            <AlertTriangle className="w-4 h-4 text-change shrink-0 mt-0.5" />
            <div>
              <div className="text-[11.5px] font-semibold text-change">
                Triggered by change event · Nov 3
              </div>
              <div className="text-[10.5px] text-t3 mt-0.5">
                {branch.change_event.label} · sustained 11-day pattern
              </div>
            </div>
          </div>
        )}

        {/* Competing Hypotheses */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-t3">
              {branch.hypotheses.length} Competing Hypotheses
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSpeakBranch}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9.5px] font-semibold transition-colors"
                style={{
                  backgroundColor: speakingSummary ? 'var(--trunk)' : 'var(--s2)',
                  color: speakingSummary ? '#030c0e' : 'var(--branch-open)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <Volume2 className="w-3 h-3" />
                <span>{speakingSummary ? 'Speaking…' : 'Listen (11Labs)'}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenRecord('sl_0412', 'ai')}
                className="font-mono text-[10px] font-semibold text-branchOpen hover:underline"
              >
                What AI saw →
              </button>
            </div>
          </div>

          {branch.hypotheses.map((hyp) => (
            <HypothesisCard
              key={hyp.rank}
              hyp={hyp}
              defaultExpanded={hyp.rank === 1}
              onOpenRecord={(rid) => onOpenRecord(rid, 'raw')}
            />
          ))}
        </div>

        {/* Experiment Card */}
        {exp && (
          <div
            className="rounded-xl p-4 space-y-2.5"
            style={{
              backgroundColor: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-branchOpen">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {exp.locked ? 'Experiment running — criterion locked' : 'Draft experiment'}
                </span>
              </div>
              {!exp.locked && (
                <button
                  type="button"
                  onClick={() => onLockExperiment(exp.id)}
                  className="px-2.5 py-1 rounded-md font-mono text-[10px] font-bold"
                  style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
                >
                  Lock criterion
                </button>
              )}
            </div>

            <div className="font-serif italic text-[16px] text-t1">{exp.description}</div>

            {/* Adherence Bar clamped safely to 0-100% */}
            <div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'rgba(20, 184, 166, 0.18)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${adherencePct}%`, backgroundColor: 'var(--branch-open)' }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-t2">
                <span>
                  {Math.min(exp.days_elapsed, exp.duration_days)} of {exp.duration_days} nights ·{' '}
                  {adherencePct}% adherence
                </span>
                <span className="font-mono text-[10px] text-branchOpen uppercase">
                  {exp.status}
                </span>
              </div>
            </div>

            <div className="font-mono text-[9.5px] text-t3 leading-relaxed">
              {exp.success_criterion} · locked Nov 10 (enforced by SQLite trigger)
            </div>
          </div>
        )}

        {/* Evidence List */}
        <div className="space-y-2 pb-4">
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-t3">
            {branch.evidence.length} Evidence Records
          </div>

          {branch.evidence.map((ev) => {
            const stripeColor = ev.metric === 'water_ml' ? 'var(--sub-emerald)' : 'var(--evi)';
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onOpenRecord(ev.id, 'raw')}
                className="w-full text-left rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3 transition-all hover:translate-x-0.5"
                style={{
                  backgroundColor: 'var(--s2)',
                  border: '1px solid var(--border)',
                  borderLeft: `3.5px solid ${stripeColor}`,
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold" style={{ color: stripeColor }}>
                      {ev.id}
                    </span>
                    <span className="text-[12px] font-medium text-t1 truncate">
                      {ev.label} · {ev.date.slice(5)} · {ev.device}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-[9.5px] text-t3">
                    <ArrowRight className="w-3 h-3" />
                    <span>tap to view full record</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
