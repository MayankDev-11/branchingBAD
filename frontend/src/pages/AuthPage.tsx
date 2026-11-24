import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { RootTraceMark } from '../components/public/RootTraceMark';
import '../styles/roottrace-public.css';

type AuthMode = 'signin' | 'signup';

const DATA_SOURCES = ['Apple Health', 'Garmin', 'Oura', 'Manual CSV'];

export const AuthPage: React.FC = () => {
  const { user, login, register, loginDemo } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialMode: AuthMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPw, setShowSignInPw] = useState(false);

  // Sign Up state
  const [fullName, setFullName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dataSource, setDataSource] = useState('Apple Health');
  const [showSignUpPw, setShowSignUpPw] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from || '/dashboard';

  useEffect(() => {
    const paramMode = searchParams.get('mode');
    if (paramMode === 'signup' || paramMode === 'signin') {
      setMode(paramMode);
    }
  }, [searchParams]);

  // If already signed in, route straight to destination
  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setSearchParams({ mode: nextMode }, { replace: true });
  };

  // Password policy checks (mirrors backend strictly)
  const pwHasLength = signUpPassword.length >= 8;
  const pwHasLetter = /[A-Za-z]/.test(signUpPassword);
  const pwHasNumber = /\d/.test(signUpPassword);
  const pwMatches = signUpPassword.length > 0 && signUpPassword === confirmPassword;
  const pwPolicyMet = pwHasLength && pwHasLetter && pwHasNumber;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(signInEmail.trim(), signInPassword);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!pwPolicyMet) {
      setError('Password must be at least 8 characters and include at least one letter and one number.');
      return;
    }
    if (!pwMatches) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await register({
        full_name: fullName.trim(),
        email: signUpEmail.trim(),
        password: signUpPassword,
        data_source: dataSource,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      await loginDemo();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start Judge Demo session.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="rl-scope min-h-screen grid grid-cols-1 lg:grid-cols-12">
      {/* LEFT EDITORIAL PANEL (Desktop) */}
      <aside
        className="hidden lg:flex lg:col-span-5 flex-col justify-between p-10 xl:p-12 border-r"
        style={{
          backgroundColor: 'var(--rl-bg-subtle)',
          borderColor: 'var(--rl-border-hairline)',
        }}
      >
        <div className="space-y-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <RootTraceMark size={26} />
            <span className="rl-mono text-[13px] font-semibold tracking-[0.16em]" style={{ color: 'var(--rl-ink-primary)' }}>
              RootTrace
            </span>
          </Link>

          <div className="space-y-4 pt-4">
            <span
              className="inline-block rl-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'var(--rl-accent-primary)' }}
            >
              Local-First Vault Guarantee
            </span>
            <h1 className="rl-serif text-[40px] leading-[1.08]" style={{ color: 'var(--rl-ink-primary)' }}>
              Authenticated locally. Auditable at every step.
            </h1>
            <p className="text-[14.5px] leading-relaxed" style={{ color: 'var(--rl-ink-secondary)' }}>
              Sessions are backed by Argon2id password hashes and HttpOnly cookies stored in your
              SQLite vault. No tokens are placed in browser storage, and raw health records never
              leave your database to an LLM.
            </p>
          </div>

          {/* Subtle Geometric Lineage Diagram */}
          <div className="rl-card p-5 space-y-3">
            <div className="rl-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
              Session &amp; Evidence Boundary
            </div>
            <svg viewBox="0 0 360 110" className="w-full h-auto" aria-hidden="true">
              <line x1="28" y1="56" x2="332" y2="56" stroke="#E2DFD7" strokeWidth="1.5" />
              <path d="M 96 56 C 122 56, 134 26, 178 26 L 264 26" fill="none" stroke="#2A574B" strokeWidth="1.8" />
              <path d="M 96 56 C 122 56, 134 86, 178 86 L 264 86" fill="none" stroke="#C77724" strokeWidth="1.6" strokeDasharray="4 4" />
              <circle cx="42" cy="56" r="6" fill="#2A574B" />
              <circle cx="96" cy="56" r="5" fill="#C77724" />
              <circle cx="264" cy="26" r="5.5" fill="#2A574B" />
              <circle cx="264" cy="86" r="5.5" fill="#FFFFFF" stroke="#C77724" strokeWidth="2" />
              <text x="16" y="79" fontSize="9.5" fill="#545955" fontFamily="JetBrains Mono, monospace">SQLite</text>
              <text x="184" y="18" fontSize="9.5" fill="#2A574B" fontFamily="JetBrains Mono, monospace">HttpOnly Cookie</text>
              <text x="184" y="103" fontSize="9.5" fill="#C77724" fontFamily="JetBrains Mono, monospace">Read-Only AI</text>
            </svg>
          </div>
        </div>

        <div className="space-y-2.5 pt-6 border-t" style={{ borderColor: 'var(--rl-border-hairline)' }}>
          {[
            'Passwords hashed exclusively with Argon2id',
            'HttpOnly + SameSite=Lax session cookies',
            'Rate-limited login protection against brute force',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--rl-ink-secondary)' }}>
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--rl-accent-primary)' }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT AUTH FORM PANEL */}
      <main className="lg:col-span-7 flex flex-col justify-between px-5 py-8 sm:px-10">
        <div className="max-w-md w-full mx-auto">
          <div className="flex items-center justify-between mb-8">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: 'var(--rl-ink-secondary)' }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to RootTrace</span>
            </Link>
            <div className="lg:hidden inline-flex items-center gap-2">
              <RootTraceMark size={22} />
              <span className="rl-mono text-[12px] font-semibold tracking-[0.14em]">RootTrace</span>
            </div>
          </div>

          <div className="rl-card p-6 sm:p-8 shadow-[0_2px_12px_rgba(21,24,23,0.04)]">
            {/* Tab Switcher */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 p-1 rounded-[10px] mb-6"
              style={{
                backgroundColor: 'var(--rl-bg-subtle)',
                border: '1px solid var(--rl-border-hairline)',
              }}
            >
              {[
                { id: 'signin' as AuthMode, label: 'Sign In' },
                { id: 'signup' as AuthMode, label: 'New User' },
              ].map((t) => {
                const active = mode === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchMode(t.id)}
                    className="py-2 rounded-[7px] text-[13.5px] font-semibold rl-transition"
                    style={{
                      backgroundColor: active ? 'var(--rl-bg-surface)' : 'transparent',
                      color: active ? 'var(--rl-ink-primary)' : 'var(--rl-ink-secondary)',
                      boxShadow: active ? '0 1px 3px rgba(21,24,23,0.08)' : 'none',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="mb-5">
              <h2 className="rl-serif text-[30px] leading-tight" style={{ color: 'var(--rl-ink-primary)' }}>
                {mode === 'signin' ? 'Sign in to your vault' : 'Create your local vault'}
              </h2>
              <p className="text-[13.5px] mt-1" style={{ color: 'var(--rl-ink-secondary)' }}>
                {mode === 'signin'
                  ? 'Enter your credentials to open the RootTrace evidence workspace.'
                  : 'Set up an account with Argon2id protection and an optional wearable default.'}
              </p>
            </div>

            {/* Inline Server / Validation Error Alert */}
            {error && (
              <div
                id="auth-error-alert"
                role="alert"
                className="mb-5 rounded-[8px] px-3.5 py-2.5 flex items-start gap-2.5 text-[13px]"
                style={{
                  backgroundColor: 'rgba(184, 59, 59, 0.08)',
                  border: '1px solid rgba(184, 59, 59, 0.35)',
                  color: 'var(--rl-status-error)',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* SIGN IN FORM */}
            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="signin-email"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Email
                  </label>
                  <input
                    id="signin-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'auth-error-alert' : undefined}
                    placeholder="you@domain.com"
                    className="rl-input w-full px-3.5 py-2.5 text-[14px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signin-password"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="signin-password"
                      type={showSignInPw ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? 'auth-error-alert' : undefined}
                      placeholder="Enter your password"
                      className="rl-input w-full pl-3.5 pr-10 py-2.5 text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignInPw((v) => !v)}
                      aria-label={showSignInPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded"
                      style={{ color: 'var(--rl-ink-muted)' }}
                    >
                      {showSignInPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !signInEmail.trim() || !signInPassword}
                  className="rl-btn-primary w-full py-2.5 text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying session...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* NEW USER SIGN UP FORM */
              <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="signup-name"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Full Name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Satwik Kumar"
                    className="rl-input w-full px-3.5 py-2.5 text-[14px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'auth-error-alert' : undefined}
                    placeholder="you@domain.com"
                    className="rl-input w-full px-3.5 py-2.5 text-[14px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showSignUpPw ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      aria-describedby="password-requirements"
                      placeholder="At least 8 characters"
                      className="rl-input w-full pl-3.5 pr-10 py-2.5 text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignUpPw((v) => !v)}
                      aria-label={showSignUpPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded"
                      style={{ color: 'var(--rl-ink-muted)' }}
                    >
                      {showSignUpPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Live Password Policy Requirements */}
                  <div id="password-requirements" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rl-mono text-[10.5px]">
                    {[
                      { ok: pwHasLength, label: '8+ chars' },
                      { ok: pwHasLetter, label: '1 letter' },
                      { ok: pwHasNumber, label: '1 number' },
                    ].map((req) => (
                      <span
                        key={req.label}
                        className="inline-flex items-center gap-1"
                        style={{ color: req.ok ? 'var(--rl-status-ok)' : 'var(--rl-ink-muted)' }}
                      >
                        <Check className="w-3 h-3" />
                        <span>{req.label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-confirm"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Confirm Password
                  </label>
                  <input
                    id="signup-confirm"
                    type={showSignUpPw ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    aria-invalid={confirmPassword.length > 0 && !pwMatches}
                    placeholder="Re-enter password"
                    className="rl-input w-full px-3.5 py-2.5 text-[14px]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signup-source"
                    className="block text-[12.5px] font-semibold mb-1.5"
                    style={{ color: 'var(--rl-ink-primary)' }}
                  >
                    Primary Wearable / Source <span className="font-normal" style={{ color: 'var(--rl-ink-muted)' }}>(optional)</span>
                  </label>
                  <select
                    id="signup-source"
                    value={dataSource}
                    onChange={(e) => setDataSource(e.target.value)}
                    className="rl-input w-full px-3.5 py-2.5 text-[14px]"
                  >
                    {DATA_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rl-btn-primary w-full py-2.5 text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Separated Judge Demo Workspace Option */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--rl-border-hairline)' }} />
              <span className="rl-mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--rl-ink-muted)' }}>
                Evaluating RootTrace?
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: 'var(--rl-border-hairline)' }} />
            </div>

            <button
              type="button"
              onClick={handleDemo}
              disabled={demoLoading}
              className="rl-btn-ghost w-full py-2.5 px-4 text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {demoLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Issuing demo session...</span>
                </>
              ) : (
                <>
                  <span>Continue with Judge Demo Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="mt-2 text-center rl-mono text-[10px]" style={{ color: 'var(--rl-ink-muted)' }}>
              Issues a real HttpOnly session scoped to demo@roottrace.local
            </p>
          </div>
        </div>

        <p className="mt-8 text-center rl-mono text-[10.5px]" style={{ color: 'var(--rl-ink-muted)' }}>
          HttpOnly cookie auth · Zero passwords or tokens in localStorage
        </p>
      </main>
    </div>
  );
};
