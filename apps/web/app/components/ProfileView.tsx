'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth, useToast } from '../providers';
import type { User } from '../lib/types';
import { Avatar } from './ui';
import { Icon } from './Icon';

export function ProfileView({ me }: { me: User }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [about, setAbout] = useState(me.about || '');
  const [gender, setGender] = useState<User['gender']>(me.gender || 'PREFER_NOT_TO_SAY');
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [ringtoneUrl, setRingtoneUrl] = useState('');
  const [callerTuneUrl, setCallerTuneUrl] = useState('');
  const [audioBusy, setAudioBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState(me.email || '');
  const [emailBusy, setEmailBusy] = useState(false);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { void apiFetch<{ ringtoneUrl: string | null; callerTuneUrl: string | null }>('/api/v1/users/me/audio-settings').then((value) => { setRingtoneUrl(value.ringtoneUrl || ''); setCallerTuneUrl(value.callerTuneUrl || ''); }).catch(() => undefined); return () => { previewAudio.current?.pause(); }; }, []);
  async function addAccountEmail(event: React.FormEvent) {
    event.preventDefault();
    if (me.email) return;
    setEmailBusy(true);
    try {
      const result = await apiFetch<{ email: string }>('/api/v1/users/me/email', { method: 'POST', body: { email: accountEmail.trim().toLowerCase() } });
      setAccountEmail(result.email);
      setUser({ ...me, email: result.email });
      toast.success('Email address added. It cannot be changed later.', 'account-email-added');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not add email address', 'account-email-error'); }
    finally { setEmailBusy(false); }
  }
  async function saveAudio(event: React.FormEvent) { event.preventDefault(); setAudioBusy(true); try { await apiFetch('/api/v1/users/me/audio-settings', { method: 'PATCH', body: { ringtoneUrl: ringtoneUrl.trim() || null, callerTuneUrl: callerTuneUrl.trim() || null } }); toast.success('Profile call sounds saved.', 'profile-audio-saved'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save call sounds', 'profile-audio-error'); } finally { setAudioBusy(false); } }
  async function previewAudioUrl(url: string) { if (!url) { toast.warning('Enter an HTTPS audio-file URL first.', 'audio-url-required'); return; } try { previewAudio.current?.pause(); const audio = new Audio(url); audio.preload = 'auto'; audio.loop = false; previewAudio.current = audio; await audio.play(); } catch { toast.error('Could not play this URL. Use a direct, publicly accessible MP3, WAV or OGG file; streaming-page URLs are not supported.', 'audio-preview-failed'); } }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const updated = await apiFetch<{ id: string; username: string; displayName: string; about: string | null; gender: string }>('/api/v1/users/me', {
        method: 'PATCH',
        body: { displayName, about: about || null, gender },
      });
      setUser({ ...me, ...updated });
      toast.success('Profile updated successfully.', 'profile-updated', 'Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update profile', 'profile-error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Your profile</h1>
          <p className="muted">This is how friends see you across Connectly.</p>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="panel profile-preview">
          <Avatar name={displayName || me.displayName} pictureKey={me.profilePictureKey} size={88} online />
          <h2>{displayName || me.displayName}</h2>
          <span className="muted">@{me.username}</span>
          <p className="profile-about">{about || 'No about text yet.'}</p>
          <div className="profile-facts">
            <div>
              <strong>Username</strong>
              <span>@{me.username}</span>
            </div>
            <div>
              <strong>Email</strong>
              <span>{me.email || 'Not added'}</span>
            </div>
            <div>
              <strong>Gender</strong>
              <span>{(me.gender || 'PREFER_NOT_TO_SAY').replaceAll('_', ' ').toLowerCase()}</span>
            </div>
            <div>
              <strong>Profile picture</strong>
              <span>{me.profilePictureKey ? 'Uploaded profile picture' : 'No picture uploaded'}</span>
            </div>
          </div>
        </aside>

        <section className="panel">
          <div className="panel-head">
            <h2>Edit profile</h2>
            <span className="panel-note">Changes are visible to friends</span>
          </div>
          <form className="profile-form" onSubmit={save}>
            <label className="field">
              <span>Profile picture</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={avatarBusy} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { toast.error('Image must be 5 MB or smaller.', 'avatar-too-large'); return; } const form = new FormData(); form.append('file', file); setAvatarBusy(true); try { const updated = await apiFetch<{profilePictureKey:string|null}>('/api/v1/users/me/avatar', {method:'POST', body:form}); setUser({...me, profilePictureKey:updated.profilePictureKey}); toast.success('Profile picture updated.', 'avatar-updated'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Avatar upload failed', 'avatar-error'); } finally { setAvatarBusy(false); event.target.value=''; } }} />
              <small className="field-hint">PNG, JPEG, WebP or GIF · maximum 5 MB</small>
            </label>
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required />
            </label>
            <label className="field">
              <span>Gender</span>
              <select value={gender || 'PREFER_NOT_TO_SAY'} onChange={(event) => setGender(event.target.value as User['gender'])}>
                <option value="FEMALE">♀ Female</option>
                <option value="MALE">♂ Male</option>
                <option value="NON_BINARY">⚧ Non-binary</option>
                <option value="PREFER_NOT_TO_SAY">◉ Prefer not to say</option>
              </select>
              <small className="field-hint">Choose an option or keep it private.</small>
            </label>
            <label className="field">
              <span>About</span>
              <textarea value={about} onChange={(event) => setAbout(event.target.value)} maxLength={250} rows={4} placeholder="Tell friends a little about yourself" />
              <small className="field-hint">{about.length}/250 characters</small>
            </label>
<div className="form-actions">
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  setDisplayName(me.displayName);
                  setAbout(me.about || '');
                  setGender(me.gender || 'PREFER_NOT_TO_SAY');
                  toast.info('Changes discarded.', 'profile-discarded');
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </section>
        <section className="panel account-email-panel">
          <div className="panel-head"><h2>Account email</h2><span className="panel-note">Used for important account updates</span></div>
          {me.email ? <div className="account-email-locked"><div><strong>{me.email}</strong><small>This address is saved to your account and cannot be changed.</small></div><span className="email-locked-badge"><Icon name="lock" size={14}/> Locked</span></div> : <form className="profile-form" onSubmit={addAccountEmail}>
            <p className="panel-help">Add an email address to receive account notices and missed-call emails. Check that it is correct before saving; Connectly does not allow changing it afterward.</p>
            <label className="field"><span>Email address</span><input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required maxLength={255}/></label>
            <div className="form-actions"><button type="submit" className="button primary" disabled={emailBusy || !accountEmail.trim()}>{emailBusy ? 'Saving…' : 'Add email address'}</button></div>
          </form>}
        </section>
        <section className="panel profile-audio-panel">
          <div className="panel-head"><h2>Call sounds</h2><span className="panel-note">Your personal call preferences</span></div>
          <p className="panel-help">Your ringtone plays when someone calls you. Your caller tune is heard by callers while they wait. Use direct HTTPS links to playable audio files, not Amazon Music, Spotify or YouTube page URLs.</p>
          <form className="profile-form" onSubmit={saveAudio}>
            <label className="field"><span>My ringtone URL</span><input type="url" value={ringtoneUrl} onChange={(event) => setRingtoneUrl(event.target.value)} placeholder="https://.../ringtone.mp3" /></label>
            <div className="form-actions audio-guide-link-row">
              <button type="button" className="button ghost" onClick={() => void previewAudioUrl(ringtoneUrl)}>Test ringtone</button>
            </div>
            <div className="audio-github-help">
              <strong>Use a song from a public GitHub repository</strong>
              <ol>
                <li>Upload your MP3 file to a <strong>public</strong> GitHub repository.</li>
                <li>Open the uploaded MP3, select <strong>Raw</strong>, and copy its URL.</li>
                <li>Paste that direct URL into <strong>My ringtone URL</strong>, test it, then save.</li>
              </ol>
              <p>Example URL:</p>
              <code>https://raw.githubusercontent.com/USERNAME/REPOSITORY/main/audio/ringtone.mp3</code>
              <small>Use audio you own or have permission to share. The public file URL is accessible to anyone.</small>
            </div>
            <label className="field"><span>My caller tune URL</span><input type="url" value={callerTuneUrl} onChange={(event) => setCallerTuneUrl(event.target.value)} placeholder="https://example.com/caller-tune.mp3" /></label>
            <div className="form-actions"><button type="button" className="button ghost" onClick={() => void previewAudioUrl(callerTuneUrl)}>Test caller tune</button><button className="button primary" type="submit" disabled={audioBusy}>{audioBusy ? 'Saving…' : 'Save call sounds'}</button></div>
          </form>
        </section>
      </div>
    </section>
  );
}
