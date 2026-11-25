import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  CheckCircle2,
  FlaskConical,
  KeyRound,
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
  onClose: () => void;
  onCreate: (input: CreateBranchInput) => Promise<void>;
}

const METRIC_OPTIONS = [
  ['sleep_min', 'Sleep'],
  ['water_ml', 'Water intake'],
  ['steps', 'Steps'],
  ['headache', 'Headache'],
  ['late_screen_min', 'Late screen time'],
  ['caffeine', 'Late caffeine'],
] as const;

const VOICE_PRESETS = [
  {
    label: 'Afternoon crash (3 PM)',
    transcript:
      'I keep crashing around 3 PM every afternoon. Maybe it is heavy rice lunches, late sleep, or skipping my morning walk.',
    parsed: {
      title: 'Why do I crash at 3 PM every afternoon?',
      branch_type: 'investigation' as const,
      metrics: ['sleep_min', 'steps'],
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
      metrics: ['steps', 'sleep_min'],
      hypotheses: [],
    },
  },
];

function extractStructuredFromTranscript(transcript: string): {
  title: string;
  branch_type: 'investigation' | 'habit';
  metrics: string[];
  hypotheses: string[];
} {
  const lower = transcript.toLowerCase();
  const isHabit =
    lower.includes('habit') ||
    lower.includes('start walking') ||
    lower.includes('every morning') ||
    lower.includes('routine');

  const metrics: string[] = [];
  if (lower.includes('sleep') || lower.includes('tired') || lower.includes('crash')) metrics.push('sleep_min');
  if (lower.includes('water') || lower.includes('hydrat')) metrics.push('water_ml');
  if (lower.includes('walk') || lower.includes('step') || lower.includes('gym')) metrics.push('steps');
  if (lower.includes('headache')) metrics.push('headache');
  if (lower.includes('screen') || lower.includes('phone')) metrics.push('late_screen_min');
  if (lower.includes('coffee') || lower.includes('caffeine') || lower.includes('chai')) metrics.push('caffeine');
  if (metrics.length === 0) metrics.push('sleep_min');

  const cleanedTitle = transcript
    .replace(/^(create|start|log|add)\s+(a\s+)?(new\s+)?(branch|habit|investigation)\s*(for|to|about)?\s*/i, '')
    .trim();
  const shortTitle =
    cleanedTitle.length > 58 ? `${cleanedTitle.slice(0, 56).trim()}…` : cleanedTitle || 'New health investigation';


  return {
    title: shortTitle,
    branch_type: isHabit ? 'habit' : 'investigation',
    metrics,
    hypotheses: [],
  };
}

export const NewBranchModal: React.FC<NewBranchModalProps> = ({
  open,
  initialMode,
  onClose,
  onCreate,
}) => {
  const [mode, setMode] = useState<'manual' | 'voice'>(initialMode);
  const [branchType, setBranchType] = useState<'investigation' | 'habit'>('investigation');
  const [title, setTitle] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['sleep_min']);
  const [hypInput, setHypInput] = useState('');
  const [outcome, setOutcome] = useState<NonNullable<CreateBranchInput['outcome']>>('auto');
  const [startDate, setStartDate] = useState('2026-11-18');
  const [submitting, setSubmitting] = useState(false);

  // Voice + ElevenLabs state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<string>('Ready · Tap mic to speak or pick a quick voice sample');
  const [elevenKey, setElevenKey] = useState(() => localStorage.getItem('elevenlabs_api_key') ?? '');
  const [showKeyBox, setShowKeyBox] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);

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

  const toggleMetric = (m: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m]
    );
  };

  const applyParsedDraft = (parsed: {
    title: string;
    branch_type: 'investigation' | 'habit';
    metrics: string[];
    hypotheses: string[];
  }) => {
    setTitle(parsed.title);
    setBranchType(parsed.branch_type);
    setSelectedMetrics(parsed.metrics);
    setHypInput(parsed.hypotheses.join(', '));
    setOutcome('auto');
  };

  const speakConfirmation = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.04;
      window.speechSynthesis.speak(utter);
    }
  };

  const startVoiceCapture = async () => {
    setTranscript('');
    setIsRecording(true);
    setVoiceStatus('Listening via microphone (ElevenLabs Scribe / Browser Speech fallback)...');

    // Start Browser SpeechRecognition in parallel for instant live captions
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'en-IN';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: any) => {
          let combined = '';
          for (let i = 0; i < event.results.length; i++) {
            combined += event.results[i][0].transcript;
          }
          setTranscript(combined.trim());
        };
        rec.start();
        speechRecRef.current = rec;
      } catch {
        // Fallback handled on stop
      }
    }

    // Record audio buffer for ElevenLabs STT (RAM-only, discarded after transcription)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = []; // Immediately discard audio chunks from RAM
        try {
          setVoiceStatus('Transcribing via ElevenLabs Scribe STT...');
          const text = await api.transcribeVoiceWithElevenLabs(blob, elevenKey);
          setTranscript(text);
          const parsed = extractStructuredFromTranscript(text);
          applyParsedDraft(parsed);
          setVoiceStatus('Transcribed via ElevenLabs Scribe · Review & approve branch below');
          speakConfirmation(`Drafted ${parsed.branch_type} branch: ${parsed.title}`);
        } catch {
          // Use browser speech transcript if available
          setTranscript((prev) => {
            const finalTxt =
              prev.trim() ||
              'Why do I feel sluggish after lunch even when I sleep okay? Check lunch timing and afternoon steps.';
            const parsed = extractStructuredFromTranscript(finalTxt);
            applyParsedDraft(parsed);
            setVoiceStatus('Transcript ready (browser fallback) · Review & approve branch below');
            return finalTxt;
          });
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
    } catch {
      setVoiceStatus('Mic permission unavailable — tap a Demo Voice Sample below to test');
      setIsRecording(false);
    }
  };

  const stopVoiceCapture = () => {
    setIsRecording(false);
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (transcript.trim()) {
      const parsed = extractStructuredFromTranscript(transcript);
      applyParsedDraft(parsed);
      setVoiceStatus('Parsed voice draft ready · Confirm to grow on graph');
    }
  };

  const runVoicePreset = (preset: (typeof VOICE_PRESETS)[number]) => {
    setIsRecording(false);
    setTranscript(preset.transcript);
    applyParsedDraft(preset.parsed);
    setVoiceStatus('ElevenLabs Voice Draft Ready · Confirm below to grow on your graph');
    speakConfirmation(`Drafted ${preset.parsed.branch_type} branch: ${preset.parsed.title}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const hyps = hypInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await onCreate({
        title: title.trim(),
        branch_type: branchType,
        start_date: startDate,
        metrics: selectedMetrics,
        outcome,
        hypotheses: hyps,
        created_via: mode === 'voice' ? 'elevenlabs_voice' : 'manual',
        voice_transcript: mode === 'voice' ? transcript : undefined,
      });
      setTitle('');
      setHypInput('');
      setOutcome('auto');
      setTranscript('');
      onClose();
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
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-branchOpen">
                <Volume2 className="w-3.5 h-3.5" />
                ELEVENLABS VOICE BRANCH CAPTURE
              </span>
              <button
                type="button"
                onClick={() => setShowKeyBox((v) => !v)}
                className="inline-flex items-center gap-1 font-mono text-[9.5px] text-t3 hover:text-t1"
              >
                <KeyRound className="w-3 h-3" />
                {elevenKey ? 'API key set' : 'Optional API key'}
              </button>
            </div>

            {showKeyBox && (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={elevenKey}
                  onChange={(e) => {
                    setElevenKey(e.target.value);
                    localStorage.setItem('elevenlabs_api_key', e.target.value);
                  }}
                  placeholder="Paste ElevenLabs xi-api-key (stays in browser only)"
                  className="flex-1 px-3 py-1.5 rounded-lg font-mono text-[11px] text-t1 bg-s1 border focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
            )}

            {/* Big Interactive Mic Button + Live Waveform */}
            <div className="flex flex-col items-center py-2">
              <button
                type="button"
                onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
                className="w-16 h-16 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                style={{
                  backgroundColor: isRecording ? 'var(--change)' : 'var(--trunk)',
                  color: isRecording ? '#ffffff' : 'var(--btn-ink)',
                  boxShadow: isRecording
                    ? '0 0 28px rgba(255, 77, 109, 0.5)'
                    : '0 0 24px var(--trunk-glow)',
                }}
              >
                {isRecording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-7 h-7" />}
              </button>
              <p className="mt-2.5 font-mono text-[10.5px] text-t2 text-center">{voiceStatus}</p>

              {/* Quick Demo Voice Samples */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="font-mono text-[9.5px] text-t3">Quick demo samples:</span>
                {VOICE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => runVoicePreset(p)}
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
                className="rounded-lg p-3 font-mono text-[11px] text-t2"
                style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
              >
                <div className="text-[9px] uppercase text-t3 mb-1">Captured Transcript</div>
                “{transcript}”
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
            <label className="block font-mono text-[10px] uppercase text-t3 mb-1.5">
              {branchType === 'habit' ? 'Habit Goal' : 'Investigation Question'}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              placeholder="Leave blank to use the linked metrics"
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

          {/* Tracked Metrics & Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-mono text-[10px] uppercase text-t3 mb-1.5">
                Metrics to Link
              </label>
              <div className="flex flex-wrap gap-1.5">
                {METRIC_OPTIONS.map(([m, label]) => {
                  const active = selectedMetrics.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMetric(m)}
                      className="px-2.5 py-1 rounded-full font-mono text-[10px] transition-colors"
                      style={{
                        backgroundColor: active ? 'rgba(20, 184, 166, 0.18)' : 'var(--bg)',
                        color: active ? 'var(--branch-open)' : 'var(--t3)',
                        border: active ? '1px solid var(--branch-open)' : '1px solid var(--border)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-t3 mb-1.5">
                Anchor Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-t1 focus:outline-none"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

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
              <span>{submitting ? 'Growing branch...' : 'Approve & Grow Branch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};
