'use client';

import { useState } from 'react';
import { useAuth, useTheme, useToast } from '../providers';
import { Icon } from './Icon';
import { ThemeSelector } from './ui';

export function AuthScreen() {
  const { login, register } = useAuth();
  const toast = useToast();
  const { theme } = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY'>('PREFER_NOT_TO_SAY');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await register({ username, displayName: displayName || username, password, email: email.trim().toLowerCase(), gender });
        toast.success('Account created successfully. Welcome to Connectly.', 'account-created', 'Account created');
      } else {
        const user = await login(username, password);
        toast.success(`Welcome back, ${user.displayName}.`, 'login-success', 'Signed in');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      toast.error(message, `${mode}-error`);
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  }

  return (
    <main className="auth-screen" data-theme-active={theme}>
      <div className="auth-theme">
        <ThemeSelector compact />
      </div>
      <section className="auth-showcase" aria-hidden="true">
        <div className="brand brand-lg">
          connectly<span>.</span>
        </div>
        <p className="auth-tagline">Every connection matters.</p>
        <div className="showcase-card">
          <div className="showcase-row">
            <span className="showcase-avatar">AM</span>
            <div>
              <strong>Alex Morgan</strong>
              <small>Sent you a friend request</small>
            </div>
            <span className="showcase-pill">New</span>
          </div>
          <div className="showcase-message">
            <p>Hey! Are we still on for the design review at 3?</p>
            <small>Delivered · just now</small>
          </div>
          <div className="showcase-message mine">
            <p>Absolutely. I&apos;ll bring the latest mockups.</p>
            <small>Read · just now</small>
          </div>
        </div>
        <ul className="showcase-points">
          <li>
            <Icon name="shield" size={17} /> Private conversations with secure sessions
          </li>
          <li>
            <Icon name="users" size={17} /> Friends, requests and groups in one place
          </li>
          <li>
            <Icon name="spark" size={17} /> Three carefully crafted themes
          </li>
        </ul>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="brand auth-brand">
            connectly<span>.</span>
          </div>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted auth-sub">{mode === 'login' ? 'Sign in to keep the conversation going.' : 'Join Connectly and start connecting.'}</p>

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <>
                <label className="field">
                  <span>Display name</span>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" autoComplete="name" required />
                </label>
                <label className="field">
                  <span>Email <em>required</em></span>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" autoComplete="email" required />
                </label>
                <label className="field">
                  <span>Gender</span>
                  <select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} required>
                    <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="NON_BINARY">Non-binary</option>
                  </select>
                </label>
              </>
            )}
            <label className="field">
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Exact username"
                minLength={3}
                maxLength={30}
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <div className="password-input-wrap">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 10 : undefined}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'}
                />
                <button type="button" className="password-visibility" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="button primary button-wide" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? 'New to Connectly?' : 'Already have an account?'}{' '}
            <button type="button" className="link-button" onClick={switchMode}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="auth-note">
            <Icon name="lock" size={14} /> Your session is kept secure with rotating refresh tokens.
          </p>
        </div>
      </section>
    </main>
  );
}
