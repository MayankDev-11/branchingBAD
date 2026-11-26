import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronDown, Loader2, Pause, ShieldCheck, Square, Volume2 } from 'lucide-react';
import { api } from '../api';
import type {
  VoiceLanguageCode,
  VoiceLanguageOption,
  VoicePreset,
  VoicePresetKey,
  VoicePresetsResponse,
} from '../types';

const VOICE_STORAGE_KEY = 'roottrace_voice_preset';
const LANG_STORAGE_KEY = 'roottrace_voice_lang';
const PREFS_EVENT = 'roottrace:voice-prefs';

export const DEFAULT_VOICE_PRESETS: VoicePreset[] = [
  { key: 'sarah', label: 'Sarah', gender: 'female', style: 'Soft narrator' },
  { key: 'laura', label: 'Laura', gender: 'female', style: 'Warm & upbeat' },
  { key: 'george', label: 'George', gender: 'male', style: 'Articulate anchor' },
  { key: 'charlie', label: 'Charlie', gender: 'male', style: 'Friendly baritone' },
];

export const DEFAULT_VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: 'en', label: 'English', native_label: 'English' },
  { code: 'hi', label: 'Hindi', native_label: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', native_label: 'ಕನ್ನಡ' },
];

let cachedMetadata: VoicePresetsResponse | null = null;
let metadataRequest: Promise<VoicePresetsResponse> | null = null;

function readStoredVoice(presets: VoicePreset[] = DEFAULT_VOICE_PRESETS, fallback: VoicePresetKey = 'sarah'): VoicePresetKey {
  const saved = localStorage.getItem(VOICE_STORAGE_KEY) as VoicePresetKey | null;
  const valid = new Set(presets.map((p) => p.key));
  if (saved && valid.has(saved)) return saved;
  if (saved) localStorage.setItem(VOICE_STORAGE_KEY, fallback);
  return fallback;
}

function readStoredLanguage(languages: VoiceLanguageOption[] = DEFAULT_VOICE_LANGUAGES, fallback: VoiceLanguageCode = 'en'): VoiceLanguageCode {
  const saved = localStorage.getItem(LANG_STORAGE_KEY) as VoiceLanguageCode | null;
  const valid = new Set(languages.map((l) => l.code));
  if (saved && valid.has(saved)) return saved;
  if (saved) localStorage.setItem(LANG_STORAGE_KEY, fallback);
  return fallback;
}

export function toBcp47VoiceLang(code: string): string {
  const base = (code || 'en').toLowerCase().split('-')[0];
  if (base === 'hi') return 'hi-IN';
  if (base === 'kn') return 'kn-IN';
  return 'en-IN';
}

export function useVoicePreferences() {
  const [voiceKey, setVoiceState] = useState<VoicePresetKey>(() => readStoredVoice());
  const [languageCode, setLangState] = useState<VoiceLanguageCode>(() => readStoredLanguage());
  const [metadata, setMetadata] = useState<VoicePresetsResponse>(
    () =>
      cachedMetadata ?? {
        presets: DEFAULT_VOICE_PRESETS,
        languages: DEFAULT_VOICE_LANGUAGES,
        total_languages: '90+',
        default_voice: 'sarah',
        default_language: 'en',
      }
  );

  useEffect(() => {
    let active = true;
    if (!cachedMetadata) {
      if (!metadataRequest) {
        metadataRequest = api.getVoicePresets().catch(() => ({
          presets: DEFAULT_VOICE_PRESETS,
          languages: DEFAULT_VOICE_LANGUAGES,
          total_languages: '90+',
          default_voice: 'sarah',
          default_language: 'en',
        }));
      }
      metadataRequest.then((res) => {
        cachedMetadata = res;
        if (!active) return;
        setMetadata(res);

        // Auto-reset any stale localStorage voice or language key not in server presets
        const fallbackVoice = (res.presets[0]?.key ?? res.default_voice ?? 'sarah') as VoicePresetKey;
        const resolvedVoice = readStoredVoice(res.presets, res.default_voice ?? fallbackVoice);
        const fallbackLang = (res.languages[0]?.code ?? res.default_language ?? 'en') as VoiceLanguageCode;
        const resolvedLang = readStoredLanguage(res.languages, res.default_language ?? fallbackLang);
        setVoiceState(resolvedVoice);
        setLangState(resolvedLang);
      });
    }

    const syncFromStorage = () => {
      const presets = cachedMetadata?.presets ?? DEFAULT_VOICE_PRESETS;
      const defVoice = cachedMetadata?.default_voice ?? presets[0]?.key ?? 'sarah';
      const langs = cachedMetadata?.languages ?? DEFAULT_VOICE_LANGUAGES;
      const defLang = cachedMetadata?.default_language ?? langs[0]?.code ?? 'en';
      setVoiceState(readStoredVoice(presets, defVoice));
      setLangState(readStoredLanguage(langs, defLang));
    };
    window.addEventListener(PREFS_EVENT, syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      active = false;
      window.removeEventListener(PREFS_EVENT, syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  const setVoiceKey = useCallback((next: VoicePresetKey) => {
    localStorage.setItem(VOICE_STORAGE_KEY, next);
    setVoiceState(next);
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  }, []);

  const setLanguageCode = useCallback((next: VoiceLanguageCode) => {
    localStorage.setItem(LANG_STORAGE_KEY, next);
    setLangState(next);
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  }, []);

  const currentPreset =
    metadata.presets.find((p) => p.key === voiceKey) ?? metadata.presets[0] ?? DEFAULT_VOICE_PRESETS[0];
  const currentLanguage =
    metadata.languages.find((l) => l.code === languageCode) ??
    metadata.languages[0] ??
    DEFAULT_VOICE_LANGUAGES[0];

  return {
    voiceKey: currentPreset.key,
    languageCode: currentLanguage.code,
    presets: metadata.presets,
    languages: metadata.languages,
    totalLanguages: metadata.total_languages,
    currentPreset,
    currentLanguage,
    setVoiceKey,
    setLanguageCode,
  };
}

interface PopoverCoords {
  left: number;
  top?: number;
  bottom?: number;
}

interface VoiceControlProps {
  mode?: 'split' | 'picker';
  isPlaying?: boolean;
  isLoading?: boolean;
  onPlayToggle?: () => void;
  onStop?: () => void;
  voiceKey: VoicePresetKey;
  languageCode: VoiceLanguageCode;
  presets?: VoicePreset[];
  languages?: VoiceLanguageOption[];
  totalLanguages?: string;
  onChangeVoice: (key: VoicePresetKey) => void;
  onChangeLanguage: (code: VoiceLanguageCode) => void;
}

export const VoiceControl: React.FC<VoiceControlProps> = ({
  mode = 'split',
  isPlaying = false,
  isLoading = false,
  onPlayToggle,
  onStop,
  voiceKey,
  languageCode,
  presets = DEFAULT_VOICE_PRESETS,
  languages = DEFAULT_VOICE_LANGUAGES,
  totalLanguages = '90+',
  onChangeVoice,
  onChangeLanguage,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const activePreset = presets.find((p) => p.key === voiceKey) ?? presets[0] ?? DEFAULT_VOICE_PRESETS[0];
  const shortLang = languageCode.toUpperCase();

  const updatePosition = useCallback(() => {
    const anchor = triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(272, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow >= 305 || spaceBelow >= spaceAbove) {
      setCoords({ left, top: Math.min(rect.bottom + 8, window.innerHeight - 16) });
    } else {
      setCoords({ left, bottom: Math.max(12, window.innerHeight - rect.top + 8) });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const popover =
    open && coords
      ? ReactDOM.createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Narration voice and language settings"
            className="fixed z-[80] w-[272px] max-w-[calc(100vw-24px)] rounded-2xl p-3.5 shadow-2xl space-y-3"
            style={{
              left: coords.left,
              top: coords.top,
              bottom: coords.bottom,
              backgroundColor: 'var(--s1)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.42)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-t3">
                Voice &amp; Language
              </span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-s2 text-branchOpen">
                Infinity
              </span>
            </div>

            {/* 3-Way Language Segmented Control */}
            <div className="space-y-1">
              <div className="font-mono text-[9px] uppercase tracking-wider text-t3">
                Spoken language
              </div>
              <div
                className="grid grid-cols-3 p-0.5 rounded-xl gap-0.5"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                {languages.map((lang) => {
                  const active = lang.code === languageCode;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => onChangeLanguage(lang.code)}
                      aria-pressed={active}
                      className="py-1.5 px-1.5 rounded-[10px] text-[11px] font-semibold transition-colors truncate"
                      style={{
                        backgroundColor: active ? 'var(--trunk)' : 'transparent',
                        color: active ? 'var(--btn-ink)' : 'var(--t2)',
                      }}
                    >
                      {lang.native_label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2x2 Voice Preset Grid */}
            <div className="space-y-1.5">
              <div className="font-mono text-[9px] uppercase tracking-wider text-t3">
                Curated speakers
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map((preset) => {
                  const active = preset.key === voiceKey;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => onChangeVoice(preset.key)}
                      aria-pressed={active}
                      className="rounded-xl px-2.5 py-2 text-left transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--s2)' : 'var(--bg)',
                        border: active ? '1.5px solid var(--branch-open)' : '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[12px] font-semibold text-t1 truncate">
                          {preset.label}
                        </span>
                        {active && <Check className="w-3 h-3 text-branchOpen shrink-0" />}
                      </div>
                      <div className="text-[10px] text-t3 truncate mt-0.5">
                        {preset.gender === 'female' ? 'Female' : 'Male'} · {preset.style}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Privacy Shield Footer */}
            <div
              className="pt-2 border-t flex items-center gap-1.5 font-mono text-[9.5px] text-t3"
              style={{ borderColor: 'var(--border)' }}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-ok shrink-0" />
              <span>Local PII scrub · {totalLanguages} languages</span>
            </div>
          </div>,
          document.body
        )
      : null;

  if (mode === 'picker') {
    return (
      <div ref={triggerRef} className="inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Choose ElevenLabs voice and language"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-mono text-[9.5px] font-semibold transition-colors"
          style={{
            backgroundColor: open ? 'var(--trunk)' : 'var(--s2)',
            color: open ? 'var(--btn-ink)' : 'var(--t2)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <span>
            {activePreset.label} · {shortLang}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
        {popover}
      </div>
    );
  }

  return (
    <div
      ref={triggerRef}
      className="inline-flex items-center rounded-full overflow-hidden shrink-0"
      style={{
        backgroundColor: 'var(--s2)',
        border: '1px solid var(--border-strong)',
      }}
    >
      <button
        type="button"
        onClick={onPlayToggle}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 font-mono text-[9.5px] font-semibold transition-colors disabled:opacity-60"
        style={{
          backgroundColor: isPlaying ? 'var(--trunk)' : 'transparent',
          color: isPlaying ? 'var(--btn-ink)' : 'var(--branch-open)',
        }}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : isPlaying ? (
          <Pause className="w-3 h-3 shrink-0" />
        ) : (
          <Volume2 className="w-3 h-3 shrink-0" />
        )}
        <span>{isLoading ? 'Loading…' : isPlaying ? 'Playing…' : 'Listen'}</span>
        {isPlaying && (
          <span className="inline-flex items-end gap-[2px] h-2.5 ml-0.5" aria-hidden="true">
            {[0, 0.2, 0.35].map((delay, idx) => (
              <span
                key={idx}
                className="w-[2px] h-full rounded-full eq-bar bg-current"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </span>
        )}
      </button>

      {isPlaying && onStop && (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop narration"
          title="Stop narration"
          className="px-1.5 py-1 inline-flex items-center justify-center transition-colors"
          style={{
            backgroundColor: 'var(--trunk)',
            color: 'var(--btn-ink)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.22)',
          }}
        >
          <Square className="w-2.5 h-2.5 fill-current" />
        </button>
      )}

      <span
        aria-hidden="true"
        className="w-px self-stretch"
        style={{ backgroundColor: 'var(--border-strong)' }}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choose ElevenLabs voice and language"
        className="inline-flex items-center gap-1 pl-2 pr-2.5 py-1 font-mono text-[9.5px] font-semibold text-t2 hover:text-t1 transition-colors"
      >
        <span>
          {activePreset.label} · {shortLang}
        </span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {popover}
    </div>
  );
};
