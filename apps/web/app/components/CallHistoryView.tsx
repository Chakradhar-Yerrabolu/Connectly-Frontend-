'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Conversation, User } from '../lib/types';
import { Avatar, EmptyState, Spinner } from './ui';
import { Icon } from './Icon';

type CallRecord = {
  id: string; conversationId: string; callerId: string; mode: string; status: string;
  startedAt?: string | null; endedAt?: string | null; durationSeconds: number; createdAt: string;
  caller?: { id?: string; username: string; displayName: string };
};
type CallItem = CallRecord & { conversation: Conversation; other: User | undefined };

function formatDuration(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function dayLabel(value: string) {
  const date = new Date(value), now = new Date(), yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date);
}

export function CallHistoryView({ conversations, me }: { conversations: Conversation[]; me: User }) {
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true); setError('');
    const results = await Promise.allSettled(conversations.map(async (conversation) => {
      const rows = await apiFetch<CallRecord[]>(`/api/v1/conversations/${conversation.id}/calls`);
      const other = conversation.members.find((member) => member.user.id !== me.id)?.user;
      return rows.map((call) => ({ ...call, conversation, other }));
    }));
    const successful = results.filter((result): result is PromiseFulfilledResult<CallItem[]> => result.status === 'fulfilled');
    setCalls(successful.flatMap((result) => result.value).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    if (results.some((result) => result.status === 'rejected') && successful.length === 0 && conversations.length) setError('Could not load call history. Check your connection and try again.');
    setLoading(false);
  }

  useEffect(() => { void reload(); }, [conversations, me.id]);

  const filtered = useMemo(() => calls.filter((call) => {
    const name = call.callerId === me.id ? (call.other?.displayName || call.other?.username || '') : (call.caller?.displayName || call.caller?.username || '');
    const termMatch = !query.trim() || `${name} ${call.caller?.username || ''}`.toLowerCase().includes(query.trim().toLowerCase());
    const dateMatch = !date || new Date(call.createdAt).toLocaleDateString('en-CA') === date;
    return termMatch && dateMatch;
  }), [calls, query, date, me.id]);

  const grouped = useMemo(() => {
    const map = new Map<string, CallItem[]>();
    filtered.forEach((call) => { const key = dayLabel(call.createdAt); map.set(key, [...(map.get(key) || []), call]); });
    return [...map.entries()];
  }, [filtered]);

  async function hideCall(callId: string) {
    try { await apiFetch(`/api/v1/calls/${callId}/history`, { method: 'DELETE' }); setCalls((current) => current.filter((call) => call.id !== callId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove call'); }
  }
  async function clearHistory() {
    if (!window.confirm('Delete your entire call history? This only hides it from your account; other participants keep their history.')) return;
    setBusy(true);
    try { await apiFetch('/api/v1/calls/history', { method: 'DELETE' }); setCalls([]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not clear call history'); }
    finally { setBusy(false); }
  }

  return <section className="content-view call-history-view">
    <header className="view-head"><div><p className="eyebrow">Your conversations</p><h1>Call History</h1><p className="muted">Search calls by contact or jump to a specific date.</p></div>
      <button className="button danger" type="button" disabled={!calls.length || busy} onClick={() => void clearHistory()}><Icon name="trash" size={16} /> Delete history</button>
    </header>
    <div className="call-history-toolbar">
      <label className="search-field"><Icon name="search" size={16}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or username" aria-label="Search call history by name" /></label>
      <label><span className="sr-only">Filter call history by date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filter calls by date" /></label>
      {(query || date) && <button className="button secondary" onClick={() => { setQuery(''); setDate(''); }}>Clear filters</button>}
      <span className="muted">{filtered.length} call{filtered.length === 1 ? '' : 's'}</span>
    </div>
    {loading && <div className="call-history-loading"><Spinner label="Loading call history" /></div>}
    {!loading && error && <div className="form-error" role="alert">{error}</div>}
    {!loading && !error && !filtered.length && <EmptyState icon="phone" title="No calls found" description={query || date ? 'Try another name or date.' : 'Your completed, missed and declined calls will appear here.'} />}
    {!loading && !error && grouped.map(([day, items]) => <section className="call-day-group" key={day} data-call-day={day}>
      <div className="date-separator"><span>{day}</span></div>
      {items.map((call) => {
        const missed = ['NO_RESPONSE', 'MISSED', 'NO_ANSWER'].includes(call.status);
        const rejected = call.status === 'REJECTED';
        const ended = ['ENDED', 'COMPLETED'].includes(call.status);
        const outgoing = call.callerId === me.id;
        const statusLabel = missed ? (outgoing ? 'No answer' : 'Missed call') : rejected ? (outgoing ? 'Declined' : 'You declined') : ended ? 'Call ended' : call.status.replaceAll('_', ' ').toLowerCase();
        const title = call.mode === 'video' ? 'Video call' : 'Voice call';
        const name = outgoing ? (call.other?.displayName || call.other?.username || 'Conversation') : (call.caller?.displayName || call.other?.displayName || 'Unknown caller');
        return <article className={`call-message ${missed ? 'missed' : ''} ${rejected ? 'rejected' : ''}`} key={call.id}>
          <Avatar name={name} pictureKey={outgoing ? call.other?.profilePictureKey : undefined} size={42} />
          <div className="call-message-copy"><strong>{title}</strong><span>{outgoing ? 'Outgoing' : 'Incoming'} · {name}</span><small>{formatDate(call.createdAt)} · {statusLabel}</small></div>
          <div className="call-message-duration"><strong>{ended && call.durationSeconds > 0 ? formatDuration(call.durationSeconds) : '—'}</strong><small>{ended && call.durationSeconds > 0 ? 'Duration' : ' '}</small></div>
          <div className="call-history-item-actions"><Icon name={call.mode === 'video' ? 'video' : 'phone'} size={18}/><button className="icon-button" title="Delete this call from my history" aria-label="Delete call from history" onClick={() => void hideCall(call.id)}><Icon name="trash" size={16}/></button></div>
        </article>;
      })}
    </section>)}
  </section>;
}
