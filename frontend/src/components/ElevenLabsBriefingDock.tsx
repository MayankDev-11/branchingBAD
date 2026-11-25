import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, ShieldCheck, SkipForward, Volume2, X } from 'lucide-react';
import { synthesizeWithElevenLabs } from '../api';

export interface BriefingBeat {
  id: string;
  label: string;
  text: string;
  recordIds: string[];
  highlightNodes: string[];
}

interface ElevenLabsBriefingDockProps {
  // Built by GraphCanvas from the API data, so every number spoken comes from Python.
  beats: BriefingBeat[];
  onHighlightNodes: (nodeIds: string[]) => void;
  onOpenRecord: (recordId: string, tab?: 'raw' | 'ai') => void;
}

export const ElevenLabsBriefingDock: React.FC<ElevenLabsBriefingDockProps> = ({
  beats,
  onHighlightNodes,
  onOpenRecord,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [beatIdx, setBeatIdx] = useState(0);
  const [engineLabel, setEngineLabel] = useState<'ElevenLabs TTS' | 'Local Voice Fallback'>('ElevenLabs TTS');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);

  const stopPlayback = () => {
    playingRef.current = false;
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    onHighlightNodes([]);
  };

  useEffect(() => {
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playBeatAt = async (index: number) => {
    if (index >= beats.length) {
      stopPlayback();
      return;
    }
    const beat = beats[index];
    setBeatIdx(index);
    onHighlightNodes(beat.highlightNodes);
    playingRef.current = true;
    setIsPlaying(true);

    // 1. Try real ElevenLabs TTS (cached in memory so replays spend 0 credits!)
    try {
      const audioUrl = await synthesizeWithElevenLabs(beat.text);
      if (!playingRef.current) return;
      setEngineLabel('ElevenLabs TTS');
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        if (playingRef.current) playBeatAt(index + 1);
      };
      await audio.play();
      return;
    } catch {
      // 2. Seamless browser speech fallback when no API key is pasted yet
      if (!playingRef.current) return;
      setEngineLabel('Local Voice Fallback');
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(beat.text);
        utter.rate = 1.03;
        utter.onend = () => {
          if (playingRef.current) playBeatAt(index + 1);
        };
        window.speechSynthesis.speak(utter);
      } else {
        setTimeout(() => {
          if (playingRef.current) playBeatAt(index + 1);
        }, 4200);
      }
    }
  };

  const handleTogglePlay = () => {
    setExpanded(true);
    if (isPlaying) {
      stopPlayback();
    } else {
      playBeatAt(beatIdx >= beats.length ? 0 : beatIdx);
    }
  };

  const activeBeat = beats[beatIdx] ?? beats[0];
  if (!activeBeat) return null; // nothing to brief on until the data has loaded

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={handleTogglePlay}
        className="pointer-events-auto inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full text-[11.5px] font-semibold transition-all hover:scale-[1.02]"
        style={{
          backgroundColor: 'var(--s1)',
          border: '1px solid var(--branch-open)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        }}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
        >
          <Play className="w-3 h-3 fill-current ml-0.5" />
        </span>
        <span className="text-t1">Play Guided Audio Brief</span>
        <span className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-s2 text-branchOpen">
          ElevenLabs
        </span>
      </button>
    );
  }

  return (
    <div
      className="pointer-events-auto w-[460px] max-w-[92vw] rounded-2xl p-3.5 shadow-2xl space-y-2.5"
      style={{
        backgroundColor: 'var(--s1)',
        border: '1px solid var(--branch-open)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.48)',
      }}
    >
      {/* Top Row: Play + Equalizer + Title + Close */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-105"
            style={{ backgroundColor: 'var(--trunk)', color: 'var(--btn-ink)' }}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          {/* Animated Waveform Equalizer */}
          <div className="flex items-end gap-[2.5px] h-5 shrink-0">
            {[0, 0.18, 0.34, 0.12, 0.28].map((delay, i) => (
              <span
                key={i}
                className={`w-[3px] h-full rounded-full ${isPlaying ? 'eq-bar' : 'opacity-35 h-1.5'}`}
                style={{
                  backgroundColor: 'var(--branch-open)',
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold text-branchOpen">
              <Volume2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{activeBeat.label}</span>
              <span className="text-t3">· {engineLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => playBeatAt((beatIdx + 1) % beats.length)}
            title="Next insight beat"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-t2 hover:text-t1"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              stopPlayback();
              setExpanded(false);
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-t2 hover:text-t1"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Synchronized Spoken Caption */}
      <p className="text-[12px] text-t1 leading-relaxed">{activeBeat.text}</p>

      {/* Progress dots + Clickable Citations + Privacy Seal */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          {activeBeat.recordIds.map((rid) => (
            <button
              key={rid}
              type="button"
              onClick={() => onOpenRecord(rid, 'raw')}
              className="px-2 py-0.5 rounded font-mono text-[9.5px] font-semibold"
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

        <span className="inline-flex items-center gap-1 font-mono text-[9px] text-ok">
          <ShieldCheck className="w-3 h-3" /> Scrubbed text only · Node spotlight synced
        </span>
      </div>
    </div>
  );
};
