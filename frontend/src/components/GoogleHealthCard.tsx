import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Unplug, Watch } from 'lucide-react';
import { api } from '../api';
import type { GoogleHealthStatus, GoogleHealthSync } from '../types';

// Fitbit / Pixel Watch through the Google Health API. The legacy Fitbit Web API was turned off on
// 2 Nov 2026, so the device's data is read with a Google sign-in. Every number here comes from
// the backend's import of that data (rule 9). The data lives in this account's own database,
// separate from the demo story.

// What the backend's redirect after Google's sign-in (?connect=google&result=...) means.
const RESULT_TEXT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Connected. Your last 90 days of sleep and steps were imported.' },
  denied: { ok: false, text: 'You cancelled the Google sign-in. Nothing was connected.' },
  not_linked: {
    ok: false,
    text: "This Google account isn't linked to Google Health yet. Open the Google Health (Fitbit) app, sign in with the same Google account, then press Connect again.",
  },
  no_scopes: { ok: false, text: "Google didn't allow reading sleep and activity. Press Connect and tick both." },
  bad_state: { ok: false, text: 'That sign-in link expired. Press Connect again.' },
  signed_out: { ok: false, text: 'You were signed out during the Google sign-in. Sign in, then press Connect again.' },
  expired: { ok: false, text: 'The Google sign-in expired. Press Connect again.' },
};
const FALLBACK = { ok: false, text: "Google didn't complete the connection. Press Connect to try again." };

const hm = (min: number | null) => (min == null ? '—' : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`);
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export function useGoogleHealthStatus() {
  const [status, setStatus] = useState<GoogleHealthStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await api.googleHealthStatus());
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { status, setStatus, refresh };
}

export const GoogleHealthCard: React.FC<{ result?: string | null }> = ({ result }) => {
  const { status, setStatus, refresh } = useGoogleHealthStatus();
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [error, setError] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [flashDismissed, setFlashDismissed] = useState(false); // the sign-in result shows until the next action
  const flash = result && !flashDismissed ? RESULT_TEXT[result] ?? FALLBACK : null;

  const connect = async () => {
    setError('');
    setFlashDismissed(true);
    setBusy('connect');
    try {
      window.location.href = await api.googleHealthStart(); // leaves the app for Google's sign-in
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the Google sign-in');
      setBusy(null);
    }
  };

  const sync = async () => {
    setError('');
    setFlashDismissed(true);
    setBusy('sync');
    try {
      const last: GoogleHealthSync = await api.googleHealthSync();
      setStatus((s) => (s ? { ...s, last_sync: last } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (deleteData: boolean) => {
    setError('');
    setFlashDismissed(true);
    setBusy('disconnect');
    try {
      await api.googleHealthDisconnect(deleteData);
      setConfirmDisconnect(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setBusy(null);
    }
  };

  const s = status?.last_sync ?? null;
  const connected = Boolean(status?.connected);

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-[14.5px] font-semibold text-t1">Fitbit / Pixel Watch (Google Health)</h2>
          <p className="text-[12.5px] text-t2 leading-relaxed">
            Read-only Google sign-in. RootTrace imports your sleep and daily steps from the last 90 days into your own
            database, never the demo data. Sign-in tokens are stored encrypted; Disconnect revokes them.
          </p>
        </div>
        <span
          className="shrink-0 font-mono text-[10px] font-semibold px-2 py-1 rounded-full"
          style={{
            color: connected ? 'var(--ok)' : 'var(--amb)',
            border: `1px solid ${connected ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`,
          }}
        >
          {status == null ? '…' : connected ? 'CONNECTED' : 'NOT LINKED'}
        </span>
      </div>

      {flash && (
        <div
          role="status"
          className="rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-[12px]"
          style={{
            backgroundColor: flash.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: `1px solid ${flash.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
            color: flash.ok ? 'var(--ok)' : 'var(--amb)',
          }}
        >
          {flash.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{flash.text}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl px-3.5 py-2.5 text-[12px] text-change" style={{ border: '1px solid rgba(255,77,109,0.35)' }}>
          {error}
        </div>
      )}

      {status && !status.configured && !connected && (
        <p className="font-mono text-[11px] text-amb leading-relaxed">
          Not set up on this computer yet: add GOOGLE_HEALTH_CLIENT_ID and GOOGLE_HEALTH_CLIENT_SECRET to .env and
          restart the backend.
        </p>
      )}

      {!connected && (
        <div>
          {status?.needs_reconnect && (
            <p className="mb-2 text-[12px] text-amb">The Google sign-in expired. Reconnect to keep syncing.</p>
          )}
          <button
            type="button"
            onClick={connect}
            disabled={busy !== null || !status?.configured}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-t1 disabled:opacity-50"
            style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--trunk)' }}
          >
            {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Watch className="w-4 h-4 text-branchOpen" />}
            <span>{status?.needs_reconnect ? 'Reconnect Google Health' : 'Connect with Google Health'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {connected && (
        <div className="space-y-3.5">
          <p className="font-mono text-[10.5px] text-t3">
            Connected {when(status?.linked_at)} · last sync {when(s?.synced_at)}
            {s ? ` · ${shortDate(s.range.start)} to ${shortDate(s.range.end)}` : ''}
          </p>

          {s && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: 'Nights of sleep', value: String(s.nights) },
                  { label: 'Average sleep', value: hm(s.avg_sleep_min) },
                  { label: 'Days with steps', value: String(s.step_days) },
                  { label: 'Average steps', value: s.avg_steps == null ? '—' : s.avg_steps.toLocaleString() },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}>
                    <div className="font-mono text-[9.5px] text-t3 uppercase">{stat.label}</div>
                    <div className="mt-1 text-[16px] font-semibold text-t1">{stat.value}</div>
                  </div>
                ))}
              </div>

              {s.missing_scopes.length > 0 && (
                <p className="text-[11.5px] text-amb">
                  Not allowed in Google sign-in: {s.missing_scopes.join(', ').replace(/_/g, ' ')}. Disconnect and
                  connect again to allow it.
                </p>
              )}

              <div className="font-mono text-[10.5px] text-t2">
                {s.change_events.length === 0
                  ? 'Change detection: no lasting shift found in these 90 days.'
                  : `Change detection: ${s.change_events.map((e) => `${e.label} from ${shortDate(e.date)}`).join(' · ')}`}
              </div>

              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="font-mono text-[9.5px] text-t3 uppercase text-left">
                    <th className="py-1 font-normal">Last 7 days</th>
                    <th className="py-1 font-normal">Sleep</th>
                    <th className="py-1 font-normal">Steps</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((day) => (
                    <tr key={day.date} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="py-1.5 text-t2">{shortDate(day.date)}</td>
                      <td className="py-1.5 text-t1" title={day.sleep_id ?? undefined}>{hm(day.sleep_min)}</td>
                      <td className="py-1.5 text-t1" title={day.steps_id ?? undefined}>
                        {day.steps == null ? '—' : day.steps.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="font-mono text-[10px] text-t3">
                {Object.values(s.new_observations).reduce((a, b) => a + b, 0)} new readings this sync ·{' '}
                {s.already_present} already imported (never changed) · {s.excluded} implausible kept but excluded
              </p>
            </>
          )}

          {!confirmDisconnect ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sync}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold text-t1 disabled:opacity-50"
                style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--trunk)' }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />
                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisconnect(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold text-t2 disabled:opacity-50"
                style={{ border: '1px solid var(--border)' }}
              >
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </button>
            </div>
          ) : (
            <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border-strong)' }}>
              <p className="text-[12px] text-t1">Disconnect Google Health? Google's access is revoked either way.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => disconnect(false)} disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold text-t1" style={{ backgroundColor: 'var(--s2)', border: '1px solid var(--border)' }}>
                  Keep imported data
                </button>
                <button type="button" onClick={() => disconnect(true)} disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold text-change" style={{ border: '1px solid rgba(255,77,109,0.4)' }}>
                  Delete imported data
                </button>
                <button type="button" onClick={() => setConfirmDisconnect(false)} disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg text-[11.5px] text-t3">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
