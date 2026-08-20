import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Cloud, LogIn, ShieldCheck, UserPlus, WifiOff, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import comingSoonImage from '../Asset/Pics/Coming_SoonCOPY.png';

const BUSY_PHASES = new Set(['authenticating', 'loading', 'saving', 'logging-out']);

export function SyncOverlay() {
  const { syncState } = useAuth();
  if (!BUSY_PHASES.has(syncState.phase)) return null;
  return <div className="sync-screen" role="status" aria-live="assertive" aria-label={syncState.message}>
    <div className="sync-screen-mark"><Cloud aria-hidden="true" size={28} /><span /></div>
    <strong>{syncState.message}</strong>
    <small>Keep this window open until confirmation.</small>
  </div>;
}

export default function AuthScreen({ allowGuest = false, onGuest, onClose, onAuthenticated }) {
  const { login, register, syncState } = useAuth();
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const errorRef = useRef(null);
  const usernameRef = useRef(null);
  const panelRef = useRef(null);
  const busy = BUSY_PHASES.has(syncState.phase);

  useEffect(() => {
    if (window.matchMedia('(min-width: 761px)').matches) usernameRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    if (error || syncState.phase === 'error') errorRef.current?.focus();
  }, [error, syncState.error, syncState.phase]);

  useEffect(() => {
    if (!onClose) return undefined;
    const manageKeyboard = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', manageKeyboard);
    return () => window.removeEventListener('keydown', manageKeyboard);
  }, [busy, onClose]);

  const changeTab = (nextTab) => {
    setTab(nextTab);
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const cleanUsername = username.trim();
    if (!cleanUsername || !password.trim()) return setError('Enter both username and password.');
    if (tab === 'register' && password !== confirmPassword) return setError('Passwords do not match.');
    if (tab === 'register' && password.trim().length < 6) return setError('Password must be at least 6 characters.');

    try {
      if (tab === 'login') await login(cleanUsername, password);
      else await register(cleanUsername, password);
      onAuthenticated?.();
    } catch (submitError) {
      setError(submitError.message || 'Account request failed. Try again.');
    }
  };

  return <main className={onClose ? 'auth-entry auth-entry-overlay' : 'auth-entry'}>
    <section className="auth-entry-brand" aria-labelledby="auth-entry-title">
      <div className="auth-entry-number">48</div>
      <div>
        <h1 id="auth-entry-title" className="auth-entry-logo"><img src={comingSoonImage} width="3149" height="1399" alt="JKT48 Manager" /></h1>
        <p>Login with you FouReality JKT48 Gacha Photocard Oshi Account or Register</p>
      </div>
      <div className="auth-entry-facts">
        <span><ShieldCheck aria-hidden="true" size={18} /><b>Encrypted saves</b><small>Game data is encrypted before upload.</small></span>
        <span><Cloud aria-hidden="true" size={18} /><b>Monthly checkpoints</b><small>Manual saves and logout also sync.</small></span>
        <span><WifiOff aria-hidden="true" size={18} /><b>Guest mode</b><small>No account and no cloud transfer.</small></span>
      </div>
    </section>

    <section ref={panelRef} className="auth-entry-panel" role={onClose ? 'dialog' : undefined} aria-modal={onClose ? 'true' : undefined} aria-labelledby="account-form-title">
      {onClose ? <button type="button" className="auth-entry-close" aria-label="Close account screen" disabled={busy} onClick={onClose}><X aria-hidden="true" size={20} /></button> : null}
      <div className="auth-entry-heading">
        <span>JKT48 Manager account</span>
        <h2 id="account-form-title">{tab === 'login' ? 'Continue your timeline' : 'Protect this run'}</h2>
        <p>{tab === 'login' ? 'Your cloud save replaces local data after login.' : 'Existing guest progress uploads when registration succeeds.'}</p>
      </div>

      <div className="auth-entry-tabs" role="tablist" aria-label="Account action">
        <button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'active' : ''} onClick={() => changeTab('login')}>Login</button>
        <button type="button" role="tab" aria-selected={tab === 'register'} className={tab === 'register' ? 'active' : ''} onClick={() => changeTab('register')}>Register</button>
      </div>

      <form className="auth-entry-form" onSubmit={submit}>
        <label htmlFor="account-username">Username<input ref={usernameRef} id="account-username" name="username" autoComplete="username" spellCheck={false} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} disabled={busy} /></label>
        <label htmlFor="account-password">Password<input id="account-password" name="password" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
        {tab === 'register' ? <label htmlFor="account-confirm">Confirm password<input id="account-confirm" name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={busy} /></label> : null}
        {error || syncState.phase === 'error' ? <div ref={errorRef} className="auth-entry-error" role="alert" tabIndex="-1">{error || syncState.error}</div> : null}
        <button type="submit" className="auth-entry-submit" disabled={busy}>{tab === 'login' ? <LogIn aria-hidden="true" size={19} /> : <UserPlus aria-hidden="true" size={19} />}{busy ? 'Please wait…' : tab === 'login' ? 'Login and load save' : 'Register and upload save'}</button>
      </form>

      {allowGuest ? <div className="auth-entry-guest"><span>or</span><button type="button" onClick={onGuest} disabled={busy}>Continue as guest</button><small>Progress remains in this browser only.</small></div> : null}
      {syncState.phase === 'success' ? <div className="auth-entry-success" role="status"><CheckCircle2 aria-hidden="true" size={18} />{syncState.message}</div> : null}
    </section>
  </main>;
}
