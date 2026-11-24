import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import type { AskResponse, RecordDetailResponse } from '../../types';

interface RecordModalProps {
  record: RecordDetailResponse | null;
  // The last real /api/ask response, or null if nothing has been sent to the AI yet.
  askContext: AskResponse | null;
  initialTab: 'raw' | 'ai';
  onClose: () => void;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  record,
  askContext,
  initialTab,
  onClose,
}) => {
  const [tab, setTab] = useState<'raw' | 'ai'>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, record]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!record) return null;

  const sentToAi =
    askContext?.sent_to_ai ??
    'Nothing has been sent to the AI yet. Ask a question in the box at the top, and the exact scrubbed text that was sent will appear here.';
  const scrubbedParts = sentToAi.split('[PERSON_1]');

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[540px] rounded-2xl p-6 shadow-2xl"
        style={{
          backgroundColor: 'var(--s1)',
          border: '1px solid var(--border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[15px] font-bold text-t2">Record {record.id}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-full flex items-center justify-center text-t2 hover:text-t1"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pill Tabs */}
        <div
          className="mt-4 inline-flex p-1 rounded-xl"
          style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          {(['raw', 'ai'] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                style={{
                  backgroundColor: active ? 'rgba(20, 184, 166, 0.18)' : 'transparent',
                  color: active ? 'var(--branch-open)' : 'var(--t3)',
                }}
              >
                {t === 'raw' ? 'Raw record' : 'What the AI saw'}
              </button>
            );
          })}
        </div>

        {/* TAB 1: RAW RECORD */}
        {tab === 'raw' ? (
          <div className="mt-5">
            <div className="font-mono text-[9.5px] uppercase tracking-wider text-t3">Value</div>
            <div className="mt-1 font-serif text-[28px] text-branchOpen leading-tight">
              {record.value} {record.unit} ({record.display})
            </div>

            <div className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
              {[
                { label: 'Metric', value: record.metric },
                { label: 'Date', value: record.date },
                { label: 'Time', value: `${record.time} IST` },
                { label: 'Device', value: record.device },
                { label: 'Source', value: record.source_file },
                { label: 'Normalised', value: record.normalization },
                { label: 'Source ID', value: record.source_id },
              ].map((row) => (
                <div
                  key={row.label}
                  className="py-2.5 flex items-center justify-between gap-4"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="font-mono text-[10px] uppercase text-t3 shrink-0">
                    {row.label}
                  </span>
                  <span className="font-mono text-[12px] text-t2 text-right truncate">
                    {row.value}
                  </span>
                </div>
              ))}

              {/* Quality bar */}
              <div
                className="py-2.5 flex items-center justify-between gap-4"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="font-mono text-[10px] uppercase text-t3">Quality</span>
                <div className="flex items-center gap-3">
                  <div
                    className="w-32 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--s2)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(record.data_quality * 100)}%`,
                        backgroundColor: 'var(--branch-open)',
                      }}
                    />
                  </div>
                  <span className="font-mono text-[12px] text-t2">
                    {record.data_quality.toFixed(2)} / 1.00
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* TAB 2: WHAT THE AI SAW */
          <div className="mt-5 space-y-4">
            <div
              className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-[12px] font-medium"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: 'var(--amb)',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>All personal details were replaced before the AI received this</span>
            </div>

            <div
              className="rounded-xl p-4 font-mono text-[11.5px] leading-relaxed text-t2 max-h-[200px] overflow-y-auto"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              {scrubbedParts.length > 1 ? (
                <>
                  {scrubbedParts[0]}
                  <span
                    className="inline-block px-1.5 py-0.5 mr-1 rounded font-bold text-t1"
                    style={{
                      backgroundColor: 'rgba(20, 184, 166, 0.25)',
                      border: '1px solid var(--branch-open)',
                    }}
                  >
                    [PERSON_1]
                  </span>
                  {scrubbedParts.slice(1).join('[PERSON_1]')}
                </>
              ) : (
                sentToAi
              )}
            </div>

            {/* Compact Raw Summary Strip */}
            <div
              className="rounded-xl px-4 py-3"
              style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
            >
              <div className="font-mono text-[9.5px] uppercase text-t3">
                Raw Summary · {record.id}
              </div>
              <div className="mt-1 font-mono text-[11.5px] text-t1">
                {record.value} {record.unit} ({record.display}) · {record.date} · {record.device} ·
                Quality {record.data_quality}
              </div>
            </div>

            {/* Footer Verification Badges */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {askContext && askContext.dropped_claims > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'rgba(255, 77, 109, 0.14)',
                    border: '1px solid rgba(255, 77, 109, 0.40)',
                    color: 'var(--change)',
                  }}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {askContext.dropped_claims} claim{askContext.dropped_claims === 1 ? '' : 's'} dropped after checking
                </span>
              )}
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] font-semibold"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.36)',
                  color: 'var(--ok)',
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Scrubbed locally via Presidio · Mumbai AI
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};
