import React, { useEffect, useRef, useState } from 'react';
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
  X,
} from 'lucide-react';
import { api, synthesizeWithElevenLabs } from '../../api';
import { readAskAudit } from '../../askAudit';
import { VoiceControl, useVoicePreferences } from '../VoiceControl';
import type { AskResponse, BranchAction, BranchDetailResponse, BranchDraftContext, BranchHypothesis } from '../../types';

interface InvestigationPanelProps {
  branch: BranchDetailResponse | null;
  askResult: AskResponse | null;
  askQuestion: string | null;
  onClose: () => void;
  onClearAsk: () => void;
  onOpenRecord: (recordId: string, tab?: 'raw' | 'ai') => void;
  onOpenAskAudit?: () => void;
  onLockExperiment: (expId: string) => void;
  onBranchTransition: (id: string, action: BranchAction, resolution?: string) => Promise<void>;
  resolution: string | null;
  onGenerateDrafts: (id: string) => Promise<BranchDraftContext>;
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
  testLabel?: string;
  workspace?: boolean;
  onOpenRecord: (id: string) => void;
}> = ({ hyp, defaultExpanded, testLabel = 'Test', workspace = false, onOpenRecord }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const pct = hyp.confidence;
  const borderColor =
    hyp.rank === 1
      ? 'rgba(16, 185, 129, 0.35)'
      : hyp.rank === 2
      ? 'rgba(245, 158, 11, 0.30)'
      : 'rgba(255, 77, 109, 0.28)';

  const badge =
    pct === undefined
      ? null
      : pct >= 60
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
              {badge && <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: badge.bg, color: badge.color }}
              >
                {badge.icon}
                {badge.label}
              </span>}
              {workspace && pct === undefined && (
                <span className="text-[10px] font-semibold text-t3">Unscored</span>
              )}
            </div>
            {!expanded && <p className="mt-1 text-[11.5px] text-t2 leading-relaxed">
              {hyp.claims[0]?.text ?? `No direct claims yet · Proposed: ${hyp.test}`}
            </p>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {pct !== undefined && <ConfidenceRing value={pct} rank={hyp.rank} />}
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
              No matching record links yet.
            </p>
          )}
          {hyp.test && <div
            className="whitespace-pre-line rounded-lg px-2.5 py-1.5 font-mono text-[10.5px] text-t2"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            {testLabel}: {hyp.test}
          </div>}
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
  onOpenAskAudit,
  onLockExperiment,
  onBranchTransition,
  resolution,
  onGenerateDrafts,
}) => {
  const [speakingSummary, setSpeakingSummary] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioMessage, setAudioMessage] = useState('');
  const branchAudio = useRef<HTMLAudioElement | null>(null);
  const playbackRequest = useRef(0);
  const {
    voiceKey,
    languageCode,
    presets,
    languages,
    totalLanguages,
    setVoiceKey,
    setLanguageCode,
  } = useVoicePreferences();
  const [action, setAction] = useState<BranchAction | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [closing, setClosing] = useState(false);

  const [draftContext, setDraftContext] = useState<BranchDraftContext | null>(null);
  const [draftRequestId, setDraftRequestId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<{ id: string; message: string } | null>(null);

  const workspaceBranchId = branch?.id.startsWith('br_custom_') ? branch.id : null;
  const currentDraftBranch = useRef(workspaceBranchId);
  currentDraftBranch.current = workspaceBranchId;
  useEffect(() => {
    let current = true;
    setDraftContext(null);
    if (workspaceBranchId) {
      void api.getBranchDraftContext(workspaceBranchId).then((context) => {
        if (current) setDraftContext(context);
      }).catch(() => {
        if (current) setDraftError({ id: workspaceBranchId, message: 'Could not load branch drafts.' });
      });
    }
    return () => { current = false; };
  }, [workspaceBranchId, branch?.status]);
  useEffect(() => {
    setAction(null);
    setResolutionNote('');
    setActionError('');
  }, [branch?.id]);


  useEffect(() => {
    const player = branchAudio.current;
    playbackRequest.current += 1;
    setSpeakingSummary(false);
    setLoadingAudio(false);
    setAudioReady(false);
    setAudioMessage('');
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    return () => {
      playbackRequest.current += 1;
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
      }
    };
  }, [branch, askResult, voiceKey, languageCode]);

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
    const { provider } = readAskAudit(askResult.sent_to_ai);
    const hasEvidence = askResult.hypotheses.length > 0;
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
                <span className="uppercase">
                  {provider ? `${provider} · Citation-checked` :
                    askResult.sent_to_ai ? 'Citation-checked' :
                    hasEvidence ? 'Python · Demo evidence' : 'Ask RootTrace'}
                </span>
              </div>
              <h2 className="font-serif italic text-[17px] text-t1 truncate">{askQuestion}</h2>
            </div>
          </div>

          <button
            type="button"
            disabled={!askResult.sent_to_ai}
            onClick={() => {
              const rid = askResult.hypotheses[0]?.claims[0]?.record_ids[0];
              if (rid) onOpenRecord(rid, 'ai');
              else onOpenAskAudit?.();
            }}
            className="px-2.5 py-1.5 rounded-lg font-mono text-[10px] font-semibold text-branchOpen shrink-0 disabled:opacity-40"
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

          {hasEvidence ? (
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-t3">Answer from demo evidence</div>
          ) : (
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold text-t1">No matching demo evidence</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-t2">
                Try asking “How much did I sleep last week?”, “What does water intake have to do with headaches?”,
                or “What should I do next?” on a demo investigation.
              </p>
            </div>
          )}

          {askResult.hypotheses.map((h) => (
            <HypothesisCard
              key={h.rank}
              hyp={h}
              defaultExpanded={true}
              testLabel="Next step"
              onOpenRecord={(rid) => onOpenRecord(rid, 'raw')}
            />
          ))}

          {hasEvidence && (
            <p className="pt-2 font-mono text-[10px] text-t3 leading-relaxed">
              These findings use synthetic demo records. Open a record ID to inspect the source.
            </p>
          )}
        </div>
      </aside>
    );
  }

  if (!branch) return null;

  const workspace = branch.id.startsWith('br_custom_');
  const guidance = branch.guidance;
  const exp = branch.experiment;
  const adherencePct = Math.min(100, Math.max(0, exp?.adherence_pct ?? 0));
  const firstCitedId = branch.hypotheses[0]?.claims[0]?.record_ids[0] ?? branch.change_event?.record_ids[0];
  const startedOn = new Date(`${branch.start_date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const handleSpeakBranch = async () => {
    const player = branchAudio.current;
    if (!player || loadingAudio) return;
    if (!player.paused) {
      player.pause();
      return;
    }

    const request = ++playbackRequest.current;
    setAudioMessage('');
    if (!audioReady) {
      const top = branch.hypotheses[0];
      const spoken = top
        ? `Investigation: ${branch.title}. ${top.label ?? top.text}.${
            top.confidence === undefined ? '' : ` The pattern score is ${top.confidence} percent.`
          } ${top.claims[0]?.text ?? 'Not enough data yet.'}
          ${exp ? `Locked experiment: ${exp.description}. Adherence: ${adherencePct} percent.` : ''}`
        : `Investigation: ${branch.title}. Not enough data yet.`;
      setLoadingAudio(true);
      try {
        const url = await synthesizeWithElevenLabs(spoken, {
          voiceKey,
          languageCode,
          translate: languageCode !== 'en',
        });
        if (playbackRequest.current !== request) return;
        player.src = url;
        setAudioReady(true);
      } catch (error) {
        if (playbackRequest.current === request) {
          setAudioMessage(error instanceof Error ? error.message : 'ElevenLabs narration unavailable.');
        }
        return;
      } finally {
        if (playbackRequest.current === request) setLoadingAudio(false);
      }
    }

    try {
      await player.play();
    } catch (error) {
      if (playbackRequest.current === request) {
        setAudioMessage(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Audio is ready. Press Play in the player to listen.'
          : 'The browser could not play this audio.');
      }
    }
  };

  const handleStopBranch = () => {
    const player = branchAudio.current;
    playbackRequest.current += 1;
    setLoadingAudio(false);
    setSpeakingSummary(false);
    if (player) {
      player.pause();
      player.currentTime = 0;
    }
  };

  // 3. STANDARD INVESTIGATION DETAIL PANEL (Matches Screenshot 02)
  const generateDrafts = async () => {
    const id = branch.id;
    setDraftError(null);
    setDraftRequestId(id);
    try {
      const context = await onGenerateDrafts(id);
      if (currentDraftBranch.current === id) setDraftContext(context);
    } catch (error) {
      setDraftError({ id, message: error instanceof Error ? error.message : 'Could not generate Gemini drafts.' });
    } finally {
      setDraftRequestId((current) => current === id ? null : current);
    }
  };

  const confirmTransition = async () => {
    if (!action || closing) return;
    setClosing(true);
    setActionError('');
    try {
      await onBranchTransition(branch.id, action, action === 'resolve' ? resolutionNote.trim() : undefined);
      setAction(null);
      setResolutionNote('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not close this branch.');
    } finally {
      setClosing(false);
    }
  };

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
              Investigation ·{' '}
              {branch.status === 'open'
                ? `Open since ${startedOn}`
                : branch.status === 'inconclusive'
                ? 'Dissolved'
                : 'Concluded'}
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
          {branch.status === 'open'
            ? 'Open'
            : branch.status === 'inconclusive'
            ? 'Dissolved'
            : workspace
            ? 'Resolved'
            : 'Concluded'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {guidance && (
          <section className="flex items-start gap-3 rounded-xl border border-border bg-s2 p-4" aria-labelledby="branch-guidance">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amb" />
            <div className="min-w-0 space-y-2">
              <h3 id="branch-guidance" className="text-sm font-semibold text-t1">{guidance.title}</h3>
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-t2">{guidance.message}</p>
            </div>
          </section>
        )}

        {workspace && resolution && (
          <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}>
            <h3 className="text-[12px] font-semibold text-ok">Resolution on the main timeline</h3>
            <p className="mt-1 break-words text-[12px] text-t1">{resolution}</p>
          </div>
        )}

        {workspace && branch.status === 'open' && (
          <section className="space-y-2 rounded-xl p-3.5" style={{ border: '1px solid var(--border)' }}>
            {action ? (
              <>
                {action === 'resolve' ? (
                  <label className="block space-y-1 text-[12px] font-semibold text-t1">
                    Resolution note
                    <textarea
                      value={resolutionNote}
                      onChange={(event) => setResolutionNote(event.target.value)}
                      maxLength={450}
                      rows={3}
                      placeholder="What did you learn, or why are you closing this?"
                      className="w-full rounded-lg border border-border bg-bg p-2 text-[12px] text-t1"
                    />
                  </label>
                ) : (
                  <p className="text-[12px] text-t2">Remove this branch from the live graph and keep it in History.</p>
                )}
                {actionError && <p role="alert" className="text-[12px] text-change">{actionError}</p>}
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                  <button type="button" onClick={confirmTransition}
                    disabled={closing || (action === 'resolve' && !resolutionNote.trim())}
                    className="rounded-lg bg-s2 px-3 py-1.5 text-branchOpen disabled:opacity-40">
                    {closing ? 'Saving…' : action === 'resolve' ? 'Save to main timeline' : 'Confirm dissolve'}
                  </button>
                  <button type="button" onClick={() => setAction(null)} disabled={closing}
                    className="rounded-lg px-3 py-1.5 text-t2">Cancel</button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <button type="button" onClick={() => setAction('resolve')}
                  className="rounded-lg bg-s2 px-3 py-1.5 text-branchOpen">Resolve branch</button>
                <button type="button" onClick={() => setAction('dissolve')}
                  className="rounded-lg bg-s2 px-3 py-1.5 text-t2">Dissolve branch</button>
              </div>
            )}
          </section>
        )}

        {workspace && !guidance && draftContext && (draftContext.can_generate || draftContext.sent_to_ai) && (
          <section className="space-y-2 rounded-xl border border-border p-3.5">
            <h3 className="text-[12px] font-semibold text-t1">Gemini drafts</h3>
            <p className="text-[11.5px] leading-relaxed text-t2">
              Suggested factors and possible test results use synthetic demo evidence.
            </p>
            {draftContext.can_generate && branch.status === 'open' && (
              <button type="button" onClick={generateDrafts} disabled={draftRequestId === branch.id}
                className="rounded-lg bg-s2 px-3 py-1.5 text-[11px] font-semibold text-branchOpen disabled:opacity-40">
                {draftRequestId === branch.id ? 'Generating drafts…' :
                  draftContext.sent_to_ai ? 'Regenerate Gemini drafts' : 'Generate Gemini drafts'}
              </button>
            )}
            {draftContext.sent_to_ai && (
              <details className="rounded-lg border border-border px-3 py-2 text-[11px] text-t2">
                <summary className="cursor-pointer font-semibold">View Gemini draft request</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {draftContext.sent_to_ai}
                </pre>
              </details>
            )}
          </section>
        )}
        {draftError?.id === branch.id && <p role="alert" className="text-[12px] text-change">{draftError.message}</p>}
        {workspace && !!draftContext?.related_resolutions.length && (
          <section className="space-y-2 rounded-xl border border-border p-3.5">
            <h3 className="text-[12px] font-semibold text-t1">Related local resolutions</h3>
            {draftContext.related_resolutions.map(({ id, title, date, note }) => (
              <div key={id} className="text-[11.5px] leading-relaxed text-t2">
                <p className="font-semibold text-t1">{title} · {date}</p>
                <p className="break-words">{note}</p>
              </div>
            ))}
          </section>
        )}
        {workspace && !guidance && !branch.hypotheses.length && !draftContext?.can_generate && (
          <p className="text-[12px] text-t2">This branch has no suggested factors. Try a tracked demo outcome, such as headache days or short sleep.</p>
        )}

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
              <div className="text-[11.5px] font-semibold text-change">Triggered by change event</div>
              <div className="text-[10.5px] text-t3 mt-0.5">
                {branch.change_event.label} · detected by PELT
              </div>
            </div>
          </div>
        )}

        {!guidance && <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-t3">
              {branch.hypotheses.length} Competing Hypotheses
            </span>
            <div className="flex items-center gap-2">
              <VoiceControl
                isPlaying={speakingSummary}
                isLoading={loadingAudio}
                onPlayToggle={handleSpeakBranch}
                onStop={handleStopBranch}
                voiceKey={voiceKey}
                languageCode={languageCode}
                presets={presets}
                languages={languages}
                totalLanguages={totalLanguages}
                onChangeVoice={setVoiceKey}
                onChangeLanguage={setLanguageCode}
              />
              <button
                type="button"
                disabled={!firstCitedId}
                onClick={() => firstCitedId && onOpenRecord(firstCitedId, 'ai')}
                className="font-mono text-[10px] font-semibold text-branchOpen hover:underline disabled:opacity-40 whitespace-nowrap"
              >
                What AI saw →
              </button>
            </div>
          </div>

          <audio
            ref={branchAudio}
            controls
            aria-label="ElevenLabs narration"
            className={audioReady ? 'w-full' : 'hidden'}
            onPlaying={() => setSpeakingSummary(true)}
            onPause={() => setSpeakingSummary(false)}
            onEnded={() => setSpeakingSummary(false)}
          />
          {audioMessage && <p role="status" className="text-[12px] text-t2">{audioMessage}</p>}

          {branch.hypotheses.map((hyp) => (
            <HypothesisCard
              key={hyp.rank}
              hyp={hyp}
              defaultExpanded={hyp.rank === 1}
              workspace={workspace}
              testLabel={workspace ? 'Next step' : 'Test'}
              onOpenRecord={(rid) => onOpenRecord(rid, 'raw')}
            />
          ))}
        </div>}

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
              {exp.success_criterion}
              {exp.locked && exp.locked_at
                ? ` · locked ${new Date(exp.locked_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })} (enforced by SQLite trigger)`
                : ''}
            </div>
          </div>
        )}

        {!guidance && <div className="space-y-2 pb-4">
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
        </div>}
      </div>
    </aside>
  );
};
