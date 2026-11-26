import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ShieldAlert, X } from 'lucide-react';
import { readAskAudit } from '../../askAudit';
import type { AskResponse, RecordDetailResponse } from '../../types';

interface RecordModalProps {
  record: RecordDetailResponse | null;
  auditOnlyOpen?: boolean;
  // The last real /api/ask response, or null if nothing has been sent to the AI yet.
  askContext: AskResponse | null;
  initialTab: 'raw' | 'ai';
  onClose: () => void;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  record,
  auditOnlyOpen = false,
  askContext,
  initialTab,
  onClose,
}) => {
  const [tab, setTab] = useState<'raw' | 'ai'>(record ? initialTab : 'ai');

  useEffect(() => {
    setTab(record ? initialTab : 'ai');
  }, [initialTab, record, auditOnlyOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!record && !auditOnlyOpen) return null;

  const sentToAi = askContext?.sent_to_ai ?? '';
  const audit = readAskAudit(sentToAi);
  const activeTab = record ? tab : 'ai';

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ backgroundColor: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[540px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 shadow-2xl"
        style={{
          backgroundColor: 'var(--s1)',
          border: '1px solid var(--border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[15px] font-bold text-t2">
            {record ? `Record ${record.id}` : 'Ask Audit Log'}
          </h3>
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
        {record && (
          <div
            className="mt-4 inline-flex p-1 rounded-xl"
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            {(['raw', 'ai'] as const).map((t) => {
              const active = activeTab === t;
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
        )}

        {/* TAB 1: RAW RECORD */}
        {activeTab === 'raw' && record ? (
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
            {audit.provider === 'Gemini' ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold text-t1">Sent to Gemini</h4>
                  <p className="mt-1 text-[12px] leading-relaxed text-t2">
                    Gemini received a demo topic and synthetic evidence. Your typed question and account details stayed local.
                  </p>
                </div>
                <div
                  className="max-h-60 overflow-y-auto rounded-xl p-4"
                  style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <p className="text-[13px] font-semibold text-t1">{audit.topic}</p>
                  <ul className="mt-3 space-y-3">
                    {audit.hypotheses.map((hypothesis) => (
                      <li key={hypothesis.rank}>
                        <h5 className="text-[12px] font-semibold text-t1">{hypothesis.text}</h5>
                        <ul className="mt-1.5 space-y-2">
                          {hypothesis.claims.map((claim) => (
                            <li key={claim.text}>
                              <p className="text-[12px] leading-relaxed text-t2">{claim.text}</p>
                              <p className="mt-0.5 break-words font-mono text-[10px] leading-relaxed text-t3">
                                {claim.record_ids.join(' · ')}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : audit.provider === 'Claude Haiku on Bedrock' ? (
              <div>
                <h4 className="text-sm font-semibold text-t1">Sent to Claude Haiku on Bedrock</h4>
                <p className="mt-1 text-[12px] leading-relaxed text-t2">
                  Bedrock received a locally scrubbed question and evidence summaries.
                </p>
                {audit.question && <p className="mt-2 break-words text-[13px] text-t1">{audit.question}</p>}
              </div>
            ) : !sentToAi ? (
              <p className="text-[12px] leading-relaxed text-t2">
                {askContext?.red_flag
                  ? 'RootTrace stopped at the local safety check.'
                  : askContext?.hypotheses.length
                  ? 'RootTrace computed this answer locally from demo records.'
                  : 'Nothing has been sent to the AI yet. Submit an Ask question to inspect the request here.'}
              </p>
            ) : null}

            {sentToAi && (
              <details
                key={record?.id ?? 'ask-audit'}
                className="group rounded-xl"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[12px] font-semibold text-t1 [&::-webkit-details-marker]:hidden">
                  {audit.provider ? 'View raw JSON' : 'View exact request'}
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <pre
                  className="max-h-56 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[11px] leading-relaxed text-t2 [overflow-wrap:anywhere]"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  {sentToAi}
                </pre>
              </details>
            )}

            {/* Compact Raw Summary Strip */}
            {record && (
              <div
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}
              >
                <div className="font-mono text-[9.5px] uppercase text-t3">
                  Local record only · {record.id}
                </div>
                <div className="mt-1 font-mono text-[11.5px] text-t1">
                  {record.value} {record.unit} ({record.display}) · {record.date} · {record.device} ·
                  Quality {record.data_quality}
                </div>
              </div>
            )}

            {askContext && askContext.dropped_claims > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold"
                style={{
                  backgroundColor: 'rgba(255, 77, 109, 0.14)',
                  border: '1px solid rgba(255, 77, 109, 0.40)',
                  color: 'var(--change)',
                }}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                {askContext.dropped_claims} claim{askContext.dropped_claims === 1 ? '' : 's'} dropped after checking
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
};
