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
  useEffect(() => { if (window.location.hash === '#free-ringtone-guide') { const guide = document.getElementById('free-ringtone-guide') as HTMLDetailsElement | null; if (guide) { guide.open = true; guide.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, []);
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
            <div className="form-actions audio-guide-link-row"><button type="button" className="button ghost" onClick={() => void previewAudioUrl(ringtoneUrl)}>Test ringtone</button><a className="link-button audio-guide-link" href="#free-ringtone-guide" onClick={() => { const guide = document.getElementById("free-ringtone-guide") as HTMLDetailsElement | null; if (guide) guide.open = true; }}>How to create a free ringtone link <span aria-hidden="true">↗</span></a></div>
            <details className="audio-guide" id="free-ringtone-guide">
              <summary><strong>Free step-by-step ringtone guide</strong><span>Convert a song on your device and host it at a playable HTTPS URL</span></summary>
              <div className="audio-guide-content">
                <p className="panel-help"><strong>Cost: ₹0.</strong> Conversion is done locally on your computer. For a permanent public link, use a free public GitHub repository. A public repository means anyone with the link can access the audio, so upload only music you own or are allowed to share.</p>
                <ol className="audio-guide-steps">
                  <li><strong>Choose a song stored on your device.</strong><p>Keep the original audio file on your computer. Connectly cannot use a Spotify, YouTube, Apple Music or other streaming-page URL because those services do not provide a direct audio file URL.</p></li>
                  <li><strong>Install FFmpeg for free (recommended).</strong><p>Download FFmpeg from <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">ffmpeg.org/download.html</a>. On Windows, use a trusted Windows build linked from the FFmpeg download page, extract it, and add its <code>bin</code> folder to PATH. Open a new terminal and run <code>ffmpeg -version</code> to confirm it works.</p></li>
                  <li><strong>Convert the song to MP3.</strong><p>Open a terminal in the folder containing your song and run this command (replace the file names):</p><pre><code>ffmpeg -i "my-song.m4a" -vn -codec:a libmp3lame -b:a 192k "connectly-ringtone.mp3"</code></pre><p>For WAV input, replace <code>my-song.m4a</code> with your WAV filename. MP3 at 192 kbps is a good browser-compatible choice.</p></li>
                  <li><strong>Trim it to a short ringtone (optional).</strong><p>This example keeps 25 seconds starting at the 30-second mark:</p><pre><code>ffmpeg -ss 00:00:30 -i "my-song.m4a" -t 25 -vn -codec:a libmp3lame -b:a 192k "connectly-ringtone.mp3"</code></pre><p>Change the start time and duration as needed. Keep it short to reduce upload size.</p></li>
                  <li><strong>Upload the MP3 to a free GitHub repository.</strong><p>Create a free account at <a href="https://github.com/" target="_blank" rel="noreferrer">github.com</a>. Create a new repository, choose <strong>Public</strong>, and create a folder such as <code>audio</code>. Use <strong>Add file → Upload files</strong>, select <code>connectly-ringtone.mp3</code>, then commit the upload. No paid plan or server is required for a small public audio file.</p></li>
                  <li><strong>Copy the direct raw-file URL.</strong><p>Open the uploaded MP3 in the repository and click <strong>Raw</strong>. Copy the resulting address. It should look like this (replace the uppercase parts with your own values):</p><pre><code>https://raw.githubusercontent.com/USERNAME/REPOSITORY/main/audio/connectly-ringtone.mp3</code></pre><p>Make sure the URL ends in the audio file name and starts with <code>https://raw.githubusercontent.com/</code>, not a GitHub webpage URL.</p></li>
                  <li><strong>Paste, test and save it in Connectly.</strong><p>Paste that raw URL into <strong>My ringtone URL</strong>, click <strong>Test ringtone</strong>, then click <strong>Save call sounds</strong>. If the preview plays, the link is directly accessible and ready to use as your ringtone.</p></li>
                </ol>
                <div className="audio-guide-alt"><strong>No terminal? Use Audacity (free).</strong><p>Install <a href="https://www.audacityteam.org/" target="_blank" rel="noreferrer">Audacity</a>, open your local song, select a 20–30 second section, choose <strong>File → Export Audio</strong>, select MP3, and save it. Then follow the GitHub upload and raw-link steps above.</p></div>
                <p className="audio-guide-warning">Important: GitHub raw links are public and are intended for personal/test use within GitHub's fair-use limits, not large-scale audio streaming. Do not upload copyrighted songs unless you have permission. If a link stops working or the host blocks playback, upload the MP3 to another HTTPS file host that permits direct audio playback.</p>
              </div>
            </details>
            <label className="field"><span>My caller tune URL</span><input type="url" value={callerTuneUrl} onChange={(event) => setCallerTuneUrl(event.target.value)} placeholder="https://example.com/caller-tune.mp3" /></label>
            <div className="form-actions"><button type="button" className="button ghost" onClick={() => void previewAudioUrl(callerTuneUrl)}>Test caller tune</button><button className="button primary" type="submit" disabled={audioBusy}>{audioBusy ? 'Saving…' : 'Save call sounds'}</button></div>
          </form>
        </section>
      </div>
    </section>
  );
}
