import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { RootTraceMark } from '../components/public/RootTraceMark';
import { EvidenceGraphPreview } from '../components/public/EvidenceGraphPreview';
import '../styles/roottrace-public.css';

const LINEAGE_CHAIN = [
  {
    step: '01',
    chip: 'wearable_export.csv',
    meta: 'Immutable raw export · SHA-256 indexed locally',
    accent: 'var(--rl-accent-primary)',
  },
  {
    step: '02',
    chip: 'CUSUM Change-Point',
    meta: '6-day shift flagged > 2 MAD below 30d personal median',
    accent: 'var(--rl-accent-signal)',
  },
  {
    step: '03',
    chip: 'Tag: Late Caffeine',
    meta: 'Matched 5 of 6 low-HRV nights · 1 counterexample retained',
    accent: 'var(--rl-accent-primary)',
  },
  {
    step: '04',
    chip: 'Experiment EXP-04',
    meta: '14-day cutoff · success criterion locked via SQLite trigger',
    accent: 'var(--rl-accent-primary)',
  },
  {
    step: '05',
    chip: 'Read-Only Agent Summary',
    meta: 'Explains verified counts only · uncited claims dropped in Python',
    accent: 'var(--rl-status-ok)',
  },
];

const NAV_ITEMS = [
  { href: '#evidence-graph', label: 'Evidence Graph' },
  { href: '#architecture', label: 'Memory Architecture' },
  { href: '#lineage', label: 'Lineage' },
  { href: '#local-first', label: 'Local-First' },
];

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NAVBAR_HEIGHT = 64;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
let cancelGlide: (() => void) | null = null;

// Glide the window to `top` with our own animation, so it looks the same in every browser.
// Longer trips take a little longer (450–900 ms). Turning the wheel or touching the screen stops it.
const glideTo = (top: number) => {
  cancelGlide?.();
  const start = window.scrollY;
  const distance = top - start;
  if (Math.abs(distance) < 2) return;
  const duration = Math.min(900, Math.max(450, Math.abs(distance) * 0.45));
  const startTime = performance.now();
  let frame = 0;

  const stop = () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
    cancelGlide = null;
  };
  const step = (now: number) => {
    const progress = Math.min(1, (now - startTime) / duration);
    window.scrollTo(0, start + distance * easeInOutCubic(progress));
    if (progress < 1) frame = window.requestAnimationFrame(step);
    else stop();
  };

  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  cancelGlide = stop;
  frame = window.requestAnimationFrame(step);
};

// Nav links glide to their section instead of jumping, and the section heading lands just
// below the sticky navbar. People who turned on "reduce motion" still get an instant jump.
const scrollToSection = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
  const target = document.querySelector<HTMLElement>(href);
  if (!target) return;
  event.preventDefault();
  window.history.replaceState(null, '', href);

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const top = Math.min(
    maxScroll,
    Math.max(0, target.getBoundingClientRect().top + window.scrollY - NAVBAR_HEIGHT),
  );
  if (prefersReducedMotion()) window.scrollTo(0, top);
  else glideTo(top);
};

// Fills the thin bar under the navbar as the page is scrolled (0% at the top, 100% at the bottom).
// Writes the transform directly so scrolling never re-renders the page.
const useScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The page grows when the lineage panel opens, which changes the ratio without a scroll event.
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizeObserver.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return barRef;
};

export const LandingPage: React.FC = () => {
  const { user, loginDemo, logout } = useAuth();
  const navigate = useNavigate();
  const [lineageOpen, setLineageOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const progressRef = useScrollProgress();
  // Stop a glide still running if the user leaves the page mid-scroll (e.g. clicks Sign In).
  useEffect(() => () => cancelGlide?.(), []);

  const handleJudgeDemo = async () => {
    setDemoError(null);
    setDemoLoading(true);
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Unable to start demo session.');
      navigate('/auth?mode=signin');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
  };

  return (
    <div className="rl-scope min-h-screen flex flex-col">
      {/* 1. STICKY TOP NAVBAR */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-sm"
        style={{
          backgroundColor: 'rgba(247, 246, 242, 0.92)',
          borderColor: 'var(--rl-border-hairline)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2.5 shrink-0">
            <RootTraceMark size={26} />
            <span
              className="rl-mono text-[13px] font-semibold tracking-[0.16em]"
              style={{ color: 'var(--rl-ink-primary)' }}
            >
              RootTrace
            </span>
          </Link>

          <nav aria-label="Primary sections" className="hidden md:flex items-center gap-7 text-[13.5px]">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) => scrollToSection(event, item.href)}
                className="rl-transition hover:opacity-100"
                style={{ color: 'var(--rl-ink-secondary)' }}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="rl-btn-primary px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rl-btn-ghost px-3.5 py-2 text-[13px] font-medium"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth?mode=signin"
                  className="rl-btn-ghost px-4 py-2 text-[13px] font-medium"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="rl-btn-primary px-4 py-2 text-[13px] font-semibold"
                >
                  New User
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Scroll progress: fills left to right over the navbar's bottom border */}
        <div aria-hidden="true" className="absolute left-0 right-0 -bottom-px h-[2px] pointer-events-none">
          <div
            ref={progressRef}
            className="h-full origin-left"
            style={{ backgroundColor: 'var(--rl-accent-primary)', transform: 'scaleX(0)' }}
          />
        </div>
      </header>

      <main className="flex-1">
        {/* 2. ASYMMETRIC HERO SECTION */}
        <section id="evidence-graph" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* Left Editorial Column (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full rl-mono text-[10.5px] font-medium tracking-wider"
                style={{
                  backgroundColor: 'var(--rl-bg-subtle)',
                  border: '1px solid var(--rl-border-hairline)',
                  color: 'var(--rl-accent-primary)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--rl-accent-primary)' }}
                />
                LOCAL-FIRST PERSONAL HEALTH INTELLIGENCE
              </div>

              <h1
                className="rl-serif text-[46px] sm:text-[58px] leading-[1.03] tracking-[-0.015em]"
                style={{ color: 'var(--rl-ink-primary)' }}
              >
                Personal health intelligence with receipts.
              </h1>

              <p
                className="text-[15.5px] sm:text-[16.5px] leading-[1.65]"
                style={{ color: 'var(--rl-ink-secondary)' }}
              >
                Synthesize wearable exports, daily habits, and notes into a living evidence
                graph—powered by deterministic change-point detection and a strictly read-only AI
                collaborator.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to={user ? '/dashboard' : '/auth?mode=signin'}
                  className="rl-btn-primary px-5 py-2.5 text-[13.5px] font-semibold inline-flex items-center gap-2"
                >
                  <span>{user ? 'Go to Dashboard' : 'Sign In to Dashboard'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="rl-btn-ghost px-5 py-2.5 text-[13.5px] font-semibold"
                >
                  Create New Account
                </Link>
              </div>

              <div className="pt-1 flex flex-col items-start gap-1.5">
                <button
                  type="button"
                  onClick={handleJudgeDemo}
                  disabled={demoLoading}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium rl-transition hover:underline disabled:opacity-60"
                  style={{ color: 'var(--rl-accent-primary)' }}
                >
                  <span>{demoLoading ? 'Starting demo workspace...' : 'Explore Judge Demo ->'}</span>
                </button>
                {demoError && (
                  <p role="alert" className="text-[12px]" style={{ color: 'var(--rl-status-error)' }}>
                    {demoError}
                  </p>
                )}
              </div>

              <div
                className="pt-5 border-t grid grid-cols-3 gap-4"
                style={{ borderColor: 'var(--rl-border-hairline)' }}
              >
                {[
                  { val: 'SQLite', label: 'Local structured store' },
                  { val: 'PELT / CUSUM', label: 'Deterministic stats' },
                  { val: 'Read-Only', label: 'AI write boundary' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="rl-mono text-[12.5px] font-semibold" style={{ color: 'var(--rl-ink-primary)' }}>
                      {stat.val}
                    </div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--rl-ink-muted)' }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Interactive Evidence Graph Preview (7 cols) */}
            <div className="lg:col-span-7">
              <EvidenceGraphPreview />
            </div>
          </div>
        </section>

        {/* 3. THREE-TIER MEMORY ARCHITECTURE */}
        <section
          id="architecture"
          className="scroll-mt-16 border-t py-16 lg:py-20"
          style={{ borderColor: 'var(--rl-border-hairline)', backgroundColor: 'var(--rl-bg-surface)' }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-3">
              <div className="rl-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--rl-accent-primary)' }}>
                Memory Architecture
              </div>
              <h2 className="rl-serif text-[36px] sm:text-[42px] leading-[1.1]" style={{ color: 'var(--rl-ink-primary)' }}>
                Three tiers separated by math, not prompts.
              </h2>
              <p className="text-[15px] leading-relaxed" style={{ color: 'var(--rl-ink-secondary)' }}>
                Raw exports stay immutable. Statistical routines compute baselines and regime shifts
                before any language model is consulted.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  num: '01 / Observational History',
                  body: 'Local immutable log of wearables, biomarkers, and daily notes.',
                  detail: 'SHA-256 deduplicated records in SQLite with unit normalization and source-quality tags.',
                },
                {
                  num: '02 / Hypotheses',
                  body: 'Deterministic change-point detection flags real shifts against your personal baseline.',
                  detail: 'Rolling 30-day median + MAD thresholds isolate genuine shifts and track competing explanations.',
                },
                {
                  num: '03 / Experiments',
                  body: 'Structured N=1 trials linking behavioral changes back to physiological outcomes.',
                  detail: 'Success criteria lock in SQLite before day one; outcomes are decided strictly in Python.',
                },
              ].map((tier) => (
                <div
                  key={tier.num}
                  className="p-6 rounded-[12px] flex flex-col justify-between gap-4"
                  style={{
                    backgroundColor: 'var(--rl-bg-canvas)',
                    border: '1px solid var(--rl-border-hairline)',
                  }}
                >
                  <div className="space-y-3">
                    <div className="rl-mono text-[11.5px] font-semibold" style={{ color: 'var(--rl-accent-primary)' }}>
                      {tier.num}
                    </div>
                    <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--rl-ink-primary)' }}>
                      {tier.body}
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--rl-ink-secondary)' }}>
                      {tier.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Permission Badge Strip */}
            <div
              className="rounded-[12px] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--rl-bg-subtle)',
                border: '1px solid var(--rl-border-hairline)',
              }}
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" style={{ color: 'var(--rl-accent-primary)' }} />
                <span className="rl-mono text-[11.5px] font-medium" style={{ color: 'var(--rl-ink-primary)' }}>
                  AI Collaborator Scope: read-only | writes: blocked | citations: mandatory
                </span>
              </div>
              <span className="rl-mono text-[10.5px]" style={{ color: 'var(--rl-ink-muted)' }}>
                Enforced at Python tool handler layer
              </span>
            </div>
          </div>
        </section>

        {/* 4. INTERACTIVE EVIDENCE LINEAGE CARD */}
        <section id="lineage" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 space-y-3">
              <div className="rl-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--rl-accent-signal)' }}>
                Traceable Provenance
              </div>
              <h2 className="rl-serif text-[34px] sm:text-[40px] leading-[1.1]" style={{ color: 'var(--rl-ink-primary)' }}>
                Click any claim to see the exact records behind it.
              </h2>
              <p className="text-[14.5px] leading-relaxed" style={{ color: 'var(--rl-ink-secondary)' }}>
                Claims that reference nonexistent record IDs or mismatched numbers are dropped by
                Python before reaching the interface.
              </p>
            </div>

            <div className="lg:col-span-8">
              <div className="rl-card p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full rl-mono text-[10.5px] font-semibold"
                      style={{
                        backgroundColor: 'rgba(199, 119, 36, 0.12)',
                        color: 'var(--rl-accent-signal)',
                      }}
                    >
                      OBSERVED SHIFT · CHG-104
                    </span>
                    <h3 className="text-[19px] sm:text-[21px] font-semibold leading-snug" style={{ color: 'var(--rl-ink-primary)' }}>
                      Resting HRV shifted -14% across a 6-day window
                    </h3>
                    <p className="text-[13px]" style={{ color: 'var(--rl-ink-secondary)' }}>
                      Personal 30-day median: 64 ms -&gt; 6-day window median: 55 ms (n = 6 valid nights, 0 missing).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLineageOpen((prev) => !prev)}
                    aria-expanded={lineageOpen}
                    aria-controls="lineage-chain-panel"
                    className="rl-btn-ghost px-4 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5 shrink-0"
                  >
                    <span>{lineageOpen ? 'Hide Evidence Lineage' : 'Inspect Evidence Lineage'}</span>
                    {lineageOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {lineageOpen && (
                  <div
                    id="lineage-chain-panel"
                    className="pt-4 border-t space-y-4"
                    style={{ borderColor: 'var(--rl-border-hairline)' }}
                  >
                    {/* Traceable chain of chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      {LINEAGE_CHAIN.map((item, idx) => (
                        <React.Fragment key={item.chip}>
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full rl-mono text-[11px] font-medium"
                            style={{
                              backgroundColor: 'var(--rl-bg-subtle)',
                              border: '1px solid var(--rl-border-hairline)',
                              color: item.accent,
                            }}
                          >
                            <span style={{ color: 'var(--rl-ink-muted)' }}>{item.step}</span>
                            <span>{item.chip}</span>
                          </span>
                          {idx < LINEAGE_CHAIN.length - 1 && (
                            <span className="rl-mono text-[11px]" style={{ color: 'var(--rl-ink-muted)' }}>
                              -&gt;
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Audit metadata list */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {LINEAGE_CHAIN.map((item) => (
                        <div
                          key={item.step}
                          className="rounded-[8px] px-3.5 py-2.5"
                          style={{
                            backgroundColor: 'var(--rl-bg-canvas)',
                            border: '1px solid var(--rl-border-hairline)',
                          }}
                        >
                          <div className="rl-mono text-[10.5px] font-semibold" style={{ color: item.accent }}>
                            {item.step} · {item.chip}
                          </div>
                          <div className="text-[12px] mt-0.5" style={{ color: 'var(--rl-ink-secondary)' }}>
                            {item.meta}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 5. LOCAL-FIRST COMPARISON STRIP */}
        <section
          id="local-first"
          className="scroll-mt-16 border-t py-16 lg:py-20"
          style={{ borderColor: 'var(--rl-border-hairline)', backgroundColor: 'var(--rl-bg-surface)' }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="max-w-2xl space-y-2.5">
              <div className="rl-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--rl-accent-primary)' }}>
                Local-First Architecture
              </div>
              <h2 className="rl-serif text-[34px] sm:text-[40px] leading-[1.1]" style={{ color: 'var(--rl-ink-primary)' }}>
                How RootTrace differs from passive trackers.
              </h2>
            </div>

            <div className="rl-card overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr
                    style={{
                      backgroundColor: 'var(--rl-bg-subtle)',
                      borderBottom: '1px solid var(--rl-border-hairline)',
                    }}
                  >
                    <th className="py-3.5 px-5 rl-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
                      Dimension
                    </th>
                    <th className="py-3.5 px-5 rl-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
                      Generic Trackers
                    </th>
                    <th className="py-3.5 px-5 rl-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--rl-accent-primary)' }}>
                      RootTrace
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y text-[13.5px]" style={{ borderColor: 'var(--rl-border-hairline)' }}>
                  {[
                    {
                      dim: 'Data Ownership',
                      generic: 'Proprietary cloud silos; raw histories locked behind vendor accounts.',
                      roottrace: 'Local SQLite database with plain-text Markdown export and 1-click full deletion.',
                    },
                    {
                      dim: 'Insight Engine',
                      generic: 'Opaque readiness scores and unverified correlations against population averages.',
                      roottrace: 'Deterministic rolling median baselines, CUSUM/PELT change points, and locked N=1 trials.',
                    },
                    {
                      dim: 'AI Boundaries',
                      generic: 'Chatbots reading raw uploads with free-form answers and no citation checks.',
                      roottrace: 'Strictly read-only collaborator; PII scrubbed first and every claim verified against record IDs.',
                    },
                  ].map((row) => (
                    <tr key={row.dim} style={{ borderColor: 'var(--rl-border-hairline)' }}>
                      <td className="py-4 px-5 font-semibold align-top" style={{ color: 'var(--rl-ink-primary)' }}>
                        {row.dim}
                      </td>
                      <td className="py-4 px-5 align-top" style={{ color: 'var(--rl-ink-secondary)' }}>
                        {row.generic}
                      </td>
                      <td className="py-4 px-5 align-top font-medium" style={{ color: 'var(--rl-ink-primary)' }}>
                        <span className="inline-flex items-start gap-2">
                          <ShieldCheck
                            className="w-4 h-4 mt-0.5 shrink-0"
                            style={{ color: 'var(--rl-accent-primary)' }}
                          />
                          <span>{row.roottrace}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* 6. MINIMAL FOOTER */}
      <footer
        className="border-t py-8"
        style={{ borderColor: 'var(--rl-border-hairline)', backgroundColor: 'var(--rl-bg-canvas)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="rl-mono text-[12px] font-semibold" style={{ color: 'var(--rl-ink-primary)' }}>
              RootTrace · Local-First Health Intelligence
            </div>
            <p className="text-[12.5px]" style={{ color: 'var(--rl-ink-muted)' }}>
              Your raw health records remain local; external AI calls receive scrubbed summaries only.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[13px] font-medium">
            <Link to="/auth?mode=signin" style={{ color: 'var(--rl-ink-secondary)' }} className="hover:underline">
              Sign In
            </Link>
            <Link to="/auth?mode=signup" style={{ color: 'var(--rl-accent-primary)' }} className="hover:underline">
              New User
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
