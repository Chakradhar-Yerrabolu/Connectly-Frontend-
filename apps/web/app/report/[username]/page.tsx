'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { Icon } from '../../components/Icon';

const categories = [
  ['HARASSMENT', 'Harassment or bullying'], ['THREATS', 'Threats or violence'],
  ['SPAM_SCAM', 'Spam or scam'], ['IMPERSONATION', 'Impersonation'],
  ['INAPPROPRIATE_CONTENT', 'Inappropriate content'], ['HATE_SPEECH', 'Hate speech'], ['OTHER', 'Other'],
] as const;

export default function ReportUserPage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const username = useMemo(() => decodeURIComponent(params.username || ''), [params.username]);
  const [category, setCategory] = useState<(typeof categories)[number][0]>('OTHER');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (description.trim().length < 10) { setError('Please provide at least 10 characters explaining the report.'); return; }
    if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type))) { setError('Evidence must be PNG, JPG, WebP or PDF.'); return; }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) { setError('Each evidence file must be 10 MB or smaller.'); return; }
    setBusy(true);
    try {
      const report = await apiFetch<{ id: string }>('/api/v1/reports', { method: 'POST', body: { reportedUsername: username, category, description: description.trim() } });
      for (const file of files) {
        const form = new FormData(); form.append('file', file);
        await apiFetch(`/api/v1/reports/${report.id}/evidence`, { method: 'POST', body: form });
      }
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit the report.'); }
    finally { setBusy(false); }
  }

  return <main className="report-page">
    <header className="report-page-head"><Link href="/" className="admin-back"><Icon name="back" size={16}/> Back to Connectly</Link><span className="report-brand">connectly<span>.</span></span></header>
    <section className="report-card">
      {done ? <div className="report-success"><span className="report-success-icon"><Icon name="check" size={28}/></span><h1>Report submitted</h1><p>Your report about <strong>@{username}</strong> has been sent to the moderation team. Submitted evidence is attached to the report for admin review.</p><button className="button primary" onClick={() => router.push('/')}>Return to Connectly</button></div> : <>
        <div className="report-hero-icon"><Icon name="shield" size={25}/></div><p className="eyebrow">CONNECTLY SAFETY CENTRE</p><h1>Report @{username}</h1><p className="muted report-intro">Help us understand what happened. Your report is private and will only be reviewed by the moderation team.</p>
        <form onSubmit={submit} className="report-form">
          <section className="report-step"><div className="report-step-head"><span>01</span><div><strong>Choose a reason</strong><small>Select the category that best describes the issue.</small></div></div><div className="report-category-grid">{categories.map(([value, label]) => <button type="button" key={value} className={`report-category ${category === value ? 'active' : ''}`} aria-pressed={category === value} onClick={() => setCategory(value)}><span className="report-category-radio">{category === value ? '✓' : ''}</span><span>{label}</span></button>)}</div></section>
          <section className="report-step"><div className="report-step-head"><span>02</span><div><strong>Describe what happened</strong><small>Include relevant details, dates, and context.</small></div></div><label className="report-description-label"><textarea value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={5000} rows={7} placeholder="Describe the behaviour and why it concerns you…" required /></label><div className="report-character-count">{description.length}/5000 characters · minimum 10</div></section>
          <section className="report-step"><div className="report-step-head"><span>03</span><div><strong>Add proof <em>Optional</em></strong><small>Attach screenshots or documents that help explain the report.</small></div></div><input ref={fileInput} className="report-hidden-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))}/><button type="button" className="report-upload-zone" onClick={() => fileInput.current?.click()}><span className="report-upload-icon"><Icon name="paperclip" size={20}/></span><strong>Choose evidence files</strong><small>PNG, JPG, WebP or PDF · up to 10 MB per file</small></button>{files.length > 0 && <ul className="report-file-list">{files.map((file, index) => <li key={`${file.name}-${file.size}`}><span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, i) => i !== index)); if (fileInput.current) fileInput.current.value = ''; }}>Remove</button></li>)}</ul>}</section>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="report-privacy-note"><Icon name="lock" size={16}/><span>Your report and evidence are private. Do not submit evidence you do not have permission to share.</span></div>
          <div className="report-form-actions"><button type="button" className="button ghost" onClick={() => router.back()}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? 'Submitting report…' : 'Submit report'}</button></div>
        </form>
      </>}
    </section>
  </main>;
}
