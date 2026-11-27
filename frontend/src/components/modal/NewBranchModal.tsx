import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  CheckCircle2,
  FlaskConical,
  Mic,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { api } from '../../api';
import type { CreateBranchInput } from '../../types';

interface NewBranchModalProps {
  open: boolean;
  initialMode: 'manual' | 'voice';
  timelineDate: string;
  onClose: () => void;
  onCreate: (input: CreateBranchInput) => Promise<void>;
}

const VOICE_INPUT_LANGUAGES = [
  { id: 'auto', label: 'Auto (90+)' },
  { id: 'en', label: 'EN' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'kn', label: 'ಕನ್ನಡ' },
] as const;

type VoiceInputLang = (typeof VOICE_INPUT_LANGUAGES)[number]['id'];

const VOICE_PRESETS = [
  {
    label: 'Afternoon crash (3 PM)',
    transcript:
      'I keep crashing around 3 PM every afternoon. Maybe it is heavy rice lunches, late sleep, or skipping my morning walk.',
    parsed: {
      title: 'Why do I crash at 3 PM every afternoon?',
      branch_type: 'investigation' as const,
      outcome: 'afternoon_energy' as NonNullable<CreateBranchInput['outcome']>,
      hypotheses: [],
    },
  },
  {
    label: 'Morning walk habit',
    transcript:
      'Start a new habit branch to walk 25 minutes every morning before 9 AM and see if my daily energy improves.',
    parsed: {
      title: 'Walk 25 min every morning before 9 AM',
      branch_type: 'habit' as const,
      outcome: 'auto' as NonNullable<CreateBranchInput['outcome']>,
      hypotheses: [],
    },
  },
];

function extractStructuredFromTranscript(transcript: string, englishSource?: string): {
  title: string;
  branch_type: 'investigation' | 'habit';
  outcome: NonNullable<CreateBranchInput['outcome']>;
  hypotheses: string[];
} {
  const analysisText = (englishSource || transcript).trim();
  const lower = analysisText.toLowerCase();
  const isHabit =
    lower.includes('habit') ||
    lower.includes('start walking') ||
    lower.includes('every morning') ||
    lower.includes('routine');

  const cleanedTitle = analysisText
    .replace(/^(create|start|log|add)\s+(a\s+)?(new\s+)?(branch|habit|investigation)\s*(for|to|about)?\s*/i, '')
    .trim();
  const shortTitle =
    cleanedTitle.length > 58 ? `${cleanedTitle.slice(0, 56).trim()}…` : cleanedTitle || 'New health investigation';

  return {
    title: shortTitle,
    branch_type: isHabit ? 'habit' : 'investigation',
    outcome: 'auto',
    hypotheses: [],
  };
}

export const NewBranchModal: React.FC<NewBranchModalProps> = ({
  open,
  initialMode,
  timelineDate,
  onClose,
  onCreate,
}) => {
  const [mode, setMode] = useState<'manual' | 'voice'>(initialMode);
  const [branchType, setBranchType] = useState<'investigation' | 'habit'>('investigation');
  const [title, setTitle] = useState('');
  const [hypInput, setHypInput] = useState('');
  const [outcome, setOutcome] = useState<NonNullable<CreateBranchInput['outcome']>>('auto');
  const [startDate, setStartDate] = useState(timelineDate);
  useEffect(() => {
    if (open) setStartDate(timelineDate);
  }, [open, timelineDate]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Voice + ElevenLabs state
  const [voicePhase, setVoicePhase] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle');
  const [voiceInputLang, setVoiceInputLang] = useState<VoiceInputLang>('auto');
  const [transcript, setTranscript] = useState('');
  const [englishTranscript, setEnglishTranscript] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const isRecording = voicePhase === 'recording';
  const voiceBusy = voicePhase !== 'idle';

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const captureVersion = useRef(0);

  useEffect(() => {
    setVoicePhase('idle');
    setVoiceStatus('');
    setSubmitError('');
    return () => {
      captureVersion.current += 1;
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;
    };
  }, [open, mode]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const applyParsedDraft = (parsed: {
    title: string;
    branch_type: 'investigation' | 'habit';
    outcome?: NonNullable<CreateBranchInput['outcome']>;
    hypotheses: string[];
  }) => {
    setTitle(parsed.title);
    setBranchType(parsed.branch_type);
    setHypInput(parsed.hypotheses.join(', '));
    setOutcome(parsed.outcome ?? 'auto');
  };

  const startVoiceCapture = async () => {
    if (voiceBusy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceStatus('Microphone recording requires a supported browser on localhost or HTTPS.');
      return;
    }
    const version = ++captureVersion.current;
    setTranscript('');
    setEnglishTranscript('');
    setDetectedLanguage('');
    setVoicePhase('requesting');
    setVoiceStatus('Allow microphone access if your browser asks.');

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (captureVersion.current !== version) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const releaseRecorder = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
      };
      recorder.ondataavailable = ({ data }) => {
        if (data.size > 0) chunks.push(data);
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        chunks.length = 0;
        releaseRecorder();
        setVoicePhase('idle');
        setVoiceStatus('Recording was interrupted. Check your microphone and try again.');
      };
      recorder.onstop = async () => {
        releaseRecorder();
        if (captureVersion.current !== version) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        chunks.length = 0;
        try {
          if (!blob.size) {
            setVoiceStatus('No audio was captured. Start a new recording and speak before stopping.');
            return;
          }
          setVoicePhase('transcribing');
          setVoiceStatus('Transcribing with ElevenLabs Scribe v3…');
          const result = await api.transcribeVoiceWithElevenLabs(
            blob,
            voiceInputLang === 'auto' ? undefined : voiceInputLang
          );
          if (captureVersion.current !== version) return;
          const nativeText = result.text;
          const resolvedLang = result.language_code || (voiceInputLang === 'auto' ? 'en' : voiceInputLang);
          const englishDraft = result.english_text || nativeText;
          setTranscript(nativeText);
          setDetectedLanguage(resolvedLang);
          setEnglishTranscript(englishDraft !== nativeText ? englishDraft : '');
          const parsed = extractStructuredFromTranscript(nativeText, englishDraft);
          applyParsedDraft(parsed);
          setVoiceStatus(
            resolvedLang !== 'en'
              ? `Transcribed via ElevenLabs Scribe v3 (${resolvedLang.toUpperCase()}) · Review & approve branch below`
              : 'Transcribed via ElevenLabs Scribe v3 · Review & approve branch below'
          );
        } catch (error) {
          if (captureVersion.current === version) {
            setVoiceStatus(error instanceof Error ? error.message : 'Transcription failed. Try again or type the branch.');
          }
        } finally {
          if (captureVersion.current === version) setVoicePhase('idle');
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setVoicePhase('recording');
      setVoiceStatus('Recording. Speak, then select Stop and transcribe.');
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (captureVersion.current !== version) return;
      setVoicePhase('idle');
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError') {
        setVoiceStatus('Microphone access is blocked. Allow it in this site’s permissions and try again.');
      } else if (name === 'NotFoundError') {
        setVoiceStatus('No microphone was found. Connect or enable one and try again.');
      } else {
        setVoiceStatus('Could not start the microphone. Check your browser or system input settings.');
      }
    }
  };

  const stopVoiceCapture = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    setVoicePhase('transcribing');
    setVoiceStatus('Preparing recording…');
    recorder.stop();
  };

  const runVoicePreset = (preset: (typeof VOICE_PRESETS)[number]) => {
    setTranscript(preset.transcript);
    setEnglishTranscript('');
    setDetectedLanguage('en');
    applyParsedDraft(preset.parsed);
    setVoiceStatus('Sample voice draft ready · Review before creating the branch');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const hyps = hypInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await onCreate({
        title: title.trim(),
        branch_type: branchType,
        start_date: startDate,
        metrics: [],
        outcome,
        hypotheses: hyps,
        generate_drafts: branchType === 'investigation' && hyps.length === 0,
        created_via: mode === 'voice' ? 'elevenlabs_voice' : 'manual',
        voice_transcript: mode === 'voice' ? transcript : undefined,
      });
      setTitle('');
      setHypInput('');
      setOutcome('auto');
      setTranscript('');
      setEnglishTranscript('');
      setDetectedLanguage('');
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create branch.');
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[580px] rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-branchOpen">
              Grow Your Root Graph
            </div>
            <h2 className="font-serif text-[22px] text-t1 leading-tight">Create a New Branch</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-t2 hover:text-t1"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Toggle: Manual vs Speak (ElevenLabs) */}
        <div
          className="mt-4 grid grid-cols-2 p-1 rounded-xl gap-1"
          style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <button
            type="button"
            onClick={() => setMode('manual')}
            className="py-2 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: mode === 'manual' ? 'rgba(20, 184, 166, 0.18)' : 'transparent',
              color: mode === 'manual' ? 'var(--branch-open)' : 'var(--t3)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Create Manually</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('voice')}
            className="py-2 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: mode === 'voice' ? 'rgba(20, 184, 166, 0.18)' : 'transparent',
              color: mode === 'voice' ? 'var(--branch-open)' : 'var(--t3)',
            }}
          >
            <Mic className="w-4 h-4" />
            <span>Speak with ElevenLabs</span>
          </button>
        </div>

        {/* ELEVENLABS VOICE CAPTURE PANEL */}
        {mode === 'voice' && (
          <div
            className="mt-4 rounded-xl p-4 space-y-3.5"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-branchOpen">
                <Volume2 className="w-3.5 h-3.5" />
                ELEVENLABS VOICE BRANCH CAPTURE
              </span>
              <div
                role="group"
                aria-label="Spoken input language"
                className="inline-flex items-center p-0.5 rounded-full gap-0.5"
                style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
              >
                {VOICE_INPUT_LANGUAGES.map((opt) => {
                  const active = voiceInputLang === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setVoiceInputLang(opt.id)}
                      disabled={voiceBusy}
                      aria-pressed={active}
                      className="px-2 py-0.5 rounded-full font-mono text-[9.5px] font-semibold transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor: active ? 'var(--trunk)' : 'transparent',
                        color: active ? 'var(--btn-ink)' : 'var(--t2)',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-t3">
              Recording uses ElevenLabs Scribe v3 across 90+ languages (Auto-detect, EN, हिन्दी, ಕನ್ನಡ). Use a demo sample or type to keep the input local.
            </p>

            {/* Big Interactive Mic Button + Live Waveform */}
            <div className="flex flex-col items-center py-2">
              <button
                type="button"
                onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                disabled={voiceBusy && !isRecording}
                className="flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: isRecording ? 'var(--change)' : 'var(--trunk)',
                  color: isRecording ? '#ffffff' : 'var(--btn-ink)',
                  boxShadow: isRecording
                    ? '0 0 28px rgba(255, 77, 109, 0.5)'
                    : '0 0 24px var(--trunk-glow)',
                }}
              >
                {isRecording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
                {isRecording ? 'Stop and transcribe' : 'Start recording'}
              </button>
              {voiceStatus && <p role="status" className="mt-2.5 text-[11px] text-t2 text-center">{voiceStatus}</p>}

              {/* Quick Demo Voice Samples */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="font-mono text-[9.5px] text-t3">Quick demo samples:</span>
                {VOICE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => runVoicePreset(p)}
                    disabled={voiceBusy}
                    className="px-2.5 py-1 rounded-full font-mono text-[10px] text-t2 hover:text-t1 transition-colors"
                    style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
                  >
                    <Sparkles className="w-3 h-3 inline mr-1 text-branchOpen" />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {transcript && (
              <div
                className="rounded-lg p-3 font-mono text-[11px] text-t2 space-y-1.5"
                style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-2 text-[9px] uppercase text-t3">
                  <span>
                    Captured Transcript{detectedLanguage ? ` · ${detectedLanguage.toUpperCase()}` : ''}
                  </span>
                  {englishTranscript && (
                    <button
                      type="button"
                      onClick={() => setTitle(transcript.slice(0, 120))}
                      className="font-mono text-[9.5px] text-branchOpen hover:underline normal-case"
                    >
                      Use native wording as title
                    </button>
                  )}
                </div>
                <div className="text-t1">“{transcript}”</div>
                {englishTranscript && (
                  <div className="text-[10.5px] text-t3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    English match: “{englishTranscript}”
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 font-mono text-[9.5px] text-t3">
              <ShieldCheck className="w-3.5 h-3.5 text-ok shrink-0" />
              <span>Opt-in voice: avoid saying personal names · audio discarded from RAM after parse.</span>
            </div>
          </div>
        )}

        {/* STRUCTURED CONFIRMATION / MANUAL FORM */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Type Switcher */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              {
                id: 'investigation' as const,
                icon: <FlaskConical className="w-4 h-4" />,
                title: 'Investigation Branch',
                sub: 'Explore competing hypotheses',
              },
              {
                id: 'habit' as const,
                icon: <Repeat className="w-4 h-4" />,
                title: 'Habit Branch',
                sub: 'Track goal & bio adherence',
              },
            ].map((opt) => {
              const active = branchType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBranchType(opt.id)}
                  className="p-3 rounded-xl text-left flex items-start gap-2.5 transition-all"
                  style={{
                    backgroundColor: active ? 'var(--s2)' : 'var(--bg)',
                    border: active ? '1.5px solid var(--branch-open)' : '1px solid var(--border)',
                  }}
                >
                  <span className="mt-0.5 text-branchOpen">{opt.icon}</span>
                  <div>
                    <div className="text-[12.5px] font-semibold text-t1">{opt.title}</div>
                    <div className="text-[10.5px] text-t3">{opt.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Question / Branch Title */}
          <div>
            <label htmlFor="new-branch-title" className="block font-mono text-[10px] uppercase text-t3 mb-1.5">
              {branchType === 'habit' ? 'Habit Goal' : 'Investigation Question'}
            </label>
            <input
              id="new-branch-title"
              type="text"
              required
              value={title}
              onChange={(e) => { setTitle(e.target.value); setSubmitError(''); }}
              placeholder={
                branchType === 'habit'
                  ? 'e.g. Walk 25 min every morning before 9 AM'
                  : 'e.g. Why do I crash at 3 PM after lunch?'
              }
              className="w-full px-3.5 py-2.5 rounded-xl text-[13.5px] text-t1 placeholder:text-t3 focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)' }}
            />
          </div>

          {/* Sub-branches (Hypotheses) */}
          <div>
            <label className="block font-mono text-[10px] uppercase text-t3 mb-1.5">
              Possible factors (optional, comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. short sleep, late caffeine"
              value={hypInput}
              onChange={(e) => setHypInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl font-mono text-[11.5px] text-t2 focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
            />
          </div>

          {branchType === 'investigation' && (
            <label className="block space-y-1.5">
              <span className="block font-mono text-[10px] uppercase text-t3">Outcome to explain</span>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as NonNullable<CreateBranchInput['outcome']>)}
                className="w-full rounded-lg px-2.5 py-1.5 text-[11px] text-t1"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border-strong)' }}
              >
                <option value="auto">Infer from my question</option>
                <option value="headache">Headache days</option>
                <option value="sleep_min">Short sleep</option>
                <option value="afternoon_energy">Afternoon energy (no demo readings)</option>
                <option value="untracked">Other outcome</option>
              </select>
            </label>
          )}

          <p className="text-[11.5px] text-t2">
            RootTrace links relevant tracked metrics automatically. You can review the evidence after saving.
          </p>
          <label className="block space-y-1.5">
            <span className="block font-mono text-[10px] uppercase text-t3">Anchor date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-mono text-[11px] text-t1"
            />
          </label>

          {submitError && (
            <p role="alert" className="text-[12px] text-change">
              {submitError}
            </p>
          )}

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-[12.5px] font-medium text-t2 hover:text-t1"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-[12.5px] font-semibold transition-opacity disabled:opacity-45"
              style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Saving branch and checking evidence…' : 'Approve & Grow Branch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};
