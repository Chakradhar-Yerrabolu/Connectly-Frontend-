'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth, useToast } from '../providers';
import { Icon } from './Icon';
import { ThemeSelector, Spinner } from './ui';

type SessionInfo = {
  id: string;
  deviceName: string;
  platform: string;
  current: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt: string;
};

export function SettingsView() {
  const { logoutAll, clearSession } = useAuth();
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function loadSessions() {
    setLoadingSessions(true);
    setSessionError('');
    try {
      setSessions(await apiFetch<SessionInfo[]>('/api/v1/auth/sessions'));
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Could not load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }

  useEffect(() => { loadSessions(); }, []);

  async function revokeSession(session: SessionInfo) {
    setBusyId(session.id);
    try {
      await apiFetch(`/api/v1/auth/sessions/${session.id}`, { method: 'DELETE' });
      toast.success('Session revoked.', `session-revoked-${session.id}`);
      if (session.current) {
        clearSession();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke session', 'session-revoke-error');
    } finally {
      setBusyId('');
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.warning('New passwords do not match.', 'password-mismatch');
      return;
    }
    setPasswordBusy(true);
    try {
      await apiFetch('/api/v1/users/me/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword },
      });
      toast.success('Password updated. Please sign in again.', 'password-updated', 'Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      clearSession();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update password', 'password-error');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function signOutEverywhere() {
    try {
      await logoutAll();
      toast.success('Signed out of all devices.', 'logout-all-success');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sign out everywhere', 'logout-all-error');
    }
  }

  return (
    <section className="content-view settings-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
          <p className="muted">Choose a theme, manage devices and keep your account secure.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Appearance</h2>
            <span className="panel-note">Applies immediately</span>
          </div>
          <p className="panel-help">Pick one of three complete themes. Your choice is saved on this device and applied before the page loads.</p>
          <ThemeSelector />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Active sessions</h2>
            <button type="button" className="button ghost small" onClick={loadSessions} disabled={loadingSessions}>
              Refresh
            </button>
          </div>
          <p className="panel-help">Refresh tokens rotate securely. Revoke any session you do not recognize.</p>
          {loadingSessions ? (
            <div className="panel-loading">
              <Spinner label="Loading sessions" /> Loading sessions…
            </div>
          ) : sessionError ? (
            <p className="panel-message error">{sessionError}</p>
          ) : (
            <ul className="session-list">
              {sessions.map((session) => (
                <li key={session.id} className="session-item">
                  <span className="session-icon">
                    <Icon name="lock" size={17} />
                  </span>
                  <div className="session-copy">
                    <strong>
                      {session.deviceName} <span className="tag">{session.platform}</span> {session.current && <span className="tag current">This device</span>}
                    </strong>
                    <small>Signed in {new Date(session.createdAt).toLocaleString()}</small>
                    <small>Expires {new Date(session.expiresAt).toLocaleDateString()}</small>
                  </div>
                  <button type="button" className="button danger-ghost small" disabled={busyId === session.id} onClick={() => revokeSession(session)}>
                    {session.current ? 'Sign out' : 'Revoke'}
                  </button>
                </li>
              ))}
              {!sessions.length && <li className="panel-message">No active sessions found.</li>}
            </ul>
          )}
          <button type="button" className="button secondary" onClick={signOutEverywhere}>
            <Icon name="shield" size={16} /> Sign out of all devices
          </button>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Password</h2>
            <span className="panel-note">Revokes all sessions</span>
          </div>
          <form className="password-form" onSubmit={changePassword}>
            <label className="field">
              <span>Current password</span>
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} autoComplete="new-password" required />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} autoComplete="new-password" required />
            </label>
            <button type="submit" className="button primary" disabled={passwordBusy}>
              {passwordBusy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>About Connectly</h2>
          </div>
          <p className="panel-help">Connectly is a multi-platform communication app with a Next.js web client, Fastify API, PostgreSQL, Prisma and Socket.IO.</p>
          <ul className="about-list">
            <li><Icon name="chat" size={16} /> Real-time conversations and read receipts</li>
            <li><Icon name="users" size={16} /> Friends, requests, groups and notifications</li>
            <li><Icon name="shield" size={16} /> Rotating refresh-token sessions</li>
            <li><Icon name="spark" size={16} /> Light, Dark and GitHub themes</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
