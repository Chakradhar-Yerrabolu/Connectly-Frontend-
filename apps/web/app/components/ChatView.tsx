'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, Message, User } from '../lib/types';
import { apiFetch, API, getAccessToken } from '../lib/api';
import { useToast } from '../providers';
import { Icon } from './Icon';
import { Avatar, EmptyState, Spinner } from './ui';
import { CallPanel } from './CallPanel';

export function MessageStatus({ message, mine }: { message: Message; mine: boolean }) {
  if (!mine) return null;
  const read = message.receipts?.some((receipt) => receipt.readAt);
  const delivered = message.receipts?.some((receipt) => receipt.deliveredAt);
  if (message.failed) return <span className="message-status failed">Failed</span>;
  if (message.pending) return <span className="message-status">Sending…</span>;
  return (
    <span className={`message-status ${read ? 'read' : delivered ? 'delivered' : ''}`} title={read ? 'Read' : delivered ? 'Delivered' : 'Sent'}>
      <Icon name={delivered || read ? 'doubleCheck' : 'check'} size={13} />
    </span>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'ig');
  return <>{text.split(regex).map((part, index) => terms.some((term) => part.toLowerCase() === term.toLowerCase()) ? <mark key={index}>{part}</mark> : part)}</>;
}

function formatDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function InlineAttachment({ message }: { message: Message }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let objectUrl = '';
    let active = true;
    const attachmentId = message.attachment?.id;
    if (!attachmentId || !['IMAGE', 'VIDEO', 'AUDIO'].includes(message.type)) return;

    fetch(`${API}/api/v1/attachments/${attachmentId}/file`, {
      headers: { Authorization: `Bearer ${getAccessToken() || ''}` },
      credentials: 'include',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Attachment could not be loaded');
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Attachment unavailable');
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.attachment?.id, message.type]);

  if (error) return <p className="attachment-error">{error}</p>;
  if (!url) return <div className="attachment-loading">Loading {message.type.toLowerCase()}…</div>;
  if (message.type === 'IMAGE') return <a className="inline-image-link" href={url} target="_blank" rel="noreferrer"><img className="inline-message-image" src={url} alt="Image attachment" loading="lazy" /></a>;
  if (message.type === 'VIDEO') return <video className="inline-message-video" src={url} controls playsInline preload="metadata" />;
  if (message.type === 'AUDIO') return <audio className="inline-message-audio" src={url} controls preload="metadata" />;
  return null;
}

export function MessageBubble({ message, me, showSender, onDelete, onInfo, selected, onSelect, searchTerm }: { message: Message; me: User; showSender: boolean; onDelete: (message: Message) => void; onInfo: (message: Message) => void; selected?: boolean; onSelect?: (message: Message) => void; searchTerm?: string }) {
  const [mediaBusy, setMediaBusy] = useState(false);
  const mine = message.senderId === me.id;

  return (
    <article data-message-id={message.id} className={`bubble-row ${mine ? 'mine' : ''} ${selected ? 'selected' : ''}`} onContextMenu={(event) => { event.preventDefault(); onSelect?.(message); }}>
      <button type="button" className={`message-select-control ${selected ? 'checked' : ''}`} aria-label={selected ? 'Deselect message' : 'Select message'} aria-pressed={Boolean(selected)} onClick={(event) => { event.stopPropagation(); onSelect?.(message); }}>
        <Icon name={selected ? 'check' : 'plus'} size={13}/>
      </button>

      {!mine && <Avatar name={message.sender?.displayName || 'User'} pictureKey={message.sender?.profilePictureKey} size={30} className="bubble-avatar" />}

      <div className={`bubble ${mine ? 'mine' : ''}`}>
        {showSender && !mine && <strong className="bubble-sender">{message.sender?.displayName || message.sender?.username || 'User'}</strong>}

        {message.deletedAt ? <p className="deleted-message">This message was deleted.</p> : message.body && <p><HighlightedText text={message.body} query={searchTerm || ''} /></p>}

        {!message.deletedAt && message.attachment && (
          message.type === 'IMAGE' || message.type === 'VIDEO' || message.type === 'AUDIO'
            ? <InlineAttachment message={message} />
            : <div className="message-attachment">
                <Icon name="file" size={17} />
                <span>File attachment</span>
                <small>{(message.attachment.sizeBytes / (1024 * 1024)).toFixed(2)} MB</small>
                <button type="button" className="button ghost small" disabled={mediaBusy} onClick={async (event) => {
                  event.stopPropagation();
                  setMediaBusy(true);
                  try {
                    const response = await fetch(`${API}/api/v1/attachments/${message.attachment!.id}/file`, {
                      headers: { Authorization: `Bearer ${getAccessToken() || ''}` },
                      credentials: 'include'
                    });
                    if (!response.ok) throw new Error('Could not retrieve attachment');
                    const url = URL.createObjectURL(await response.blob());
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'connectly-attachment';
                    link.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
                  } catch (error) {
                    window.alert(error instanceof Error ? error.message : 'Download failed');
                  } finally {
                    setMediaBusy(false);
                  }
                }}>
                  {mediaBusy ? 'Loading…' : 'Download'}
                </button>
              </div>
        )}

        <div className="bubble-meta">
          <span>{formatTime(message.createdAt)}</span>
          <MessageStatus message={message} mine={mine} />
        </div>
      </div>
    </article>
  );
}

export function ChatView({
  conversation,
  me,
  messages,
  loading,
  error,
  typingUsers,
  onlineUsers,
  infoOpen,
  archived,
  connected,
  onSend,
  onTyping,
  onRetry,
  onBack,
  onToggleInfo,
  onToggleArchive,
  callRequest,
  onCallRequestHandled,
}: {
  conversation: Conversation | null;
  me: User;
  messages: Message[];
  loading: boolean;
  error: string;
  typingUsers: string[];
  onlineUsers: Set<string>;
  infoOpen: boolean;
  archived: boolean;
  connected: boolean;
  onSend: (body: string, attachmentId?: string) => void;
  onTyping?: () => void;
  onRetry: () => void;
  onBack: () => void;
  onToggleInfo: () => void;
  onToggleArchive: () => void;
  callRequest?: { mode: 'audio' | 'video'; callId?: string } | null;
  onCallRequestHandled?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatActionsOpen, setChatActionsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [remoteResults, setRemoteResults] = useState<Message[] | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [callHistory, setCallHistory] = useState<Array<{ id: string; callerId: string; mode: string; status: string; durationSeconds: number; createdAt: string; caller?: { displayName: string; username: string } }>>([]);
  const [callMode, setCallMode] = useState<'audio' | 'video' | null>(null);
  const [callNotify, setCallNotify] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | undefined>(undefined);
  const [infoMessage, setInfoMessage] = useState<Message | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const forceInitialBottomRef = useRef(true);
  const wasNearBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<Message[]>([]);

  useEffect(() => {
    if (callRequest) {
      setCallMode(callRequest.mode);
      setCallNotify(false);
      setActiveCallId(callRequest.callId);
      onCallRequestHandled?.();
    }
  }, [callRequest, onCallRequestHandled]);

  useEffect(() => {
    if (conversation?.id) {
      apiFetch<typeof callHistory>(`/api/v1/conversations/${conversation.id}/calls`).then(setCallHistory).catch(() => setCallHistory([]));
    }

    forceInitialBottomRef.current = true;
    setDraft('');
    setSearch('');
    setSearchOpen(false);
    setSearchDate('');
    setRemoteResults(null);
    setSearchMatches([]);
    setActiveSearchIndex(0);
    setSelectedMessages([]);
  }, [conversation?.id]);

  function scrollToLatest(behavior: ScrollBehavior = 'auto') {
    const node = scrollRef.current;
    if (!node) return;

    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);

    scrollFrameRef.current = requestAnimationFrame(() => {
      const current = scrollRef.current;
      if (current) current.scrollTo({ top: current.scrollHeight, behavior });
      scrollFrameRef.current = null;
    });
  }

  function handleMessagesScroll() {
    const node = scrollRef.current;
    if (node) {
      wasNearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
    }
  }

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || loading) return;

    if (forceInitialBottomRef.current) {
      scrollToLatest('auto');
      requestAnimationFrame(() => scrollToLatest('auto'));
      forceInitialBottomRef.current = false;
      wasNearBottomRef.current = true;
      return;
    }

    if (wasNearBottomRef.current) scrollToLatest('smooth');
  }, [messages, loading, conversation?.id, callHistory]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || loading) return;

    const observer = new ResizeObserver(() => {
      if (forceInitialBottomRef.current || wasNearBottomRef.current) scrollToLatest('auto');
    });

    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);

    const onMediaLoad = (event: Event) => {
      if ((event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) && wasNearBottomRef.current) {
        scrollToLatest('auto');
      }
    };

    node.addEventListener('load', onMediaLoad, true);

    return () => {
      observer.disconnect();
      node.removeEventListener('load', onMediaLoad, true);
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [conversation?.id, loading]);

  const other = conversation ? conversation.members.find((member) => member.user.id !== me.id)?.user : undefined;
  const title = conversation?.title || other?.displayName || other?.username || 'Select a conversation';
  const isOnline = other ? onlineUsers.has(other.id) || Boolean(other.online) : false;
  const showSender = conversation?.type === 'GROUP';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (remoteResults) return remoteResults;
    if (!term) return messages;
    return messages.filter((message) => (message.body || '').toLowerCase().includes(term) || (message.sender?.displayName || '').toLowerCase().includes(term));
  }, [messages, search, remoteResults]);

  function focusSearchResult(index: number, rows = filtered) {
    if (!rows.length) return;

    const safeIndex = (index + rows.length) % rows.length;
    setActiveSearchIndex(safeIndex);
    const target = rows[safeIndex];

    requestAnimationFrame(() => {
      const node = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${target.id}"]`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Corrected date search: check conversation before accessing conversation.id.
  async function searchByDate(value: string) {
    setSearchDate(value);
    setSearch('');
    setActiveSearchIndex(0);

    if (!value || !conversation) {
      setRemoteResults(null);
      setSearchMatches([]);
      return;
    }

    try {
      const rows = await apiFetch<Message[]>(
        `/api/v1/conversations/${conversation.id}/search?date=${encodeURIComponent(value)}`
      );

      setRemoteResults(rows);
      setSearchMatches(rows);

      if (rows.length) {
        focusSearchResult(0, rows);
      }
    } catch {
      setRemoteResults([]);
      setSearchMatches([]);
    }
  }

  const timelineGroups = useMemo(() => {
    const items = [
      ...filtered.map((message) => ({ kind: 'message' as const, id: message.id, createdAt: message.createdAt, message })),
      ...callHistory.filter((call) => !searchDate || new Date(call.createdAt).toLocaleDateString('en-CA') === searchDate)
        .map((call) => ({ kind: 'call' as const, id: call.id, createdAt: call.createdAt, call })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const groups: { day: string; items: typeof items }[] = [];

    for (const item of items) {
      const day = formatDay(item.createdAt);
      const last = groups[groups.length - 1];

      if (last && last.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    }

    return groups;
  }, [filtered, callHistory, searchDate]);

  function submit() {
    const value = draft.trim();
    if (!value) return;

    onSend(value);
    setDraft('');

    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  async function uploadAndSend(file: File) {
    setUploading(true);

    try {
      const form = new FormData();
      form.append('file', file);

      const attachment = await apiFetch<{ id: string }>('/api/v1/attachments', {
        method: 'POST',
        body: form
      });

      onSend('', attachment.id);
      toast.success('Attachment sent.', `attachment-${attachment.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed', 'attachment-upload-error');
    } finally {
      setUploading(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice recording is not supported by this browser.', 'voice-unsupported');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      recorderRef.current = recorder;
      recordChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) recordChunks.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(recordChunks.current, {
          type: recorder.mimeType || 'audio/webm'
        });

        if (blob.size) {
          await uploadAndSend(new File([blob], `voice-${Date.now()}.webm`, {
            type: blob.type
          }));
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Microphone permission was denied or unavailable.', 'microphone-error');
    }
  }

  if (!conversation) {
    return (
      <section className="chat-pane">
        <div className="chat-empty">
          <EmptyState
            icon="message"
            title="Your conversations, connected"
            description="Choose a chat from the sidebar or start a new conversation with a friend."
          />

          <div className="chat-empty-art" aria-hidden="true">
            <span className="art-bubble art-one">Hey there!</span>
            <span className="art-bubble art-two">Ready to connect?</span>
            <span className="art-avatar">C</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`chat-pane ${infoOpen ? 'with-info' : ''}`}>
      <header className="chat-header">
        <button type="button" className="icon-button mobile-back" onClick={onBack} aria-label="Back to conversations">
          <Icon name="back" size={20} />
        </button>

        <Avatar name={title} pictureKey={other?.profilePictureKey} size={42} online={conversation.type === 'GROUP' ? undefined : isOnline} />

        <div className="chat-title">
          <strong>{title}</strong>
          <small>
            {conversation.type === 'GROUP'
              ? `${conversation.members.length} members`
              : typingUsers.length
                ? 'typing…'
                : isOnline
                  ? 'Online'
                  : 'Offline'}
          </small>
        </div>


        <div className="chat-header-actions">
          <button type="button" className="icon-button" onClick={() => {
            setCallNotify(true); setActiveCallId(undefined); setCallMode('audio');
          }} aria-label="Start voice call" title="Voice call">
            <Icon name="phone" size={18} />
          </button>
          <button type="button" className="icon-button" onClick={() => {
            setCallNotify(true); setActiveCallId(undefined); setCallMode('video');
          }} aria-label="Start video call" title="Video call">
            <Icon name="video" size={18} />
          </button>
          <div className="chat-actions-menu-wrap">
            <button type="button"
              className={`icon-button chat-actions-trigger ${chatActionsOpen ? 'active' : ''}`}
              onClick={() => setChatActionsOpen((open) => !open)}
              aria-label="More conversation options" aria-haspopup="menu"
              aria-expanded={chatActionsOpen} title="More options">
              <Icon name="more" size={19} />
            </button>
            {chatActionsOpen && (
              <>
                <button type="button" className="chat-actions-dismiss"
                  aria-label="Close conversation options"
                  onClick={() => setChatActionsOpen(false)} />
                <div className="chat-actions-menu" role="menu" aria-label="Conversation options">
                  <button type="button" role="menuitem" onClick={async () => {
                    setChatActionsOpen(false);
                    const favorite = !conversation.members.find((member) => member.user.id === me.id)?.isFavorite;
                    try {
                      await apiFetch(`/api/v1/conversations/${conversation.id}/favorite`, { method: 'PATCH', body: { favorite } });
                      window.location.reload();
                    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update favourite'); }
                  }}>
                    <Icon name="star" size={17} />
                    <span>{conversation.members.find((member) => member.user.id === me.id)?.isFavorite ? 'Remove from starred' : 'Star conversation'}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={async () => {
                    setChatActionsOpen(false);
                    const secret = window.prompt('Set a secret key (at least 4 characters). Enter it later in the Chats search bar to reveal this chat.');
                    if (!secret) return;
                    try {
                      await apiFetch(`/api/v1/conversations/${conversation.id}/lock`, { method: 'POST', body: { secret } });
                      window.location.reload();
                    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not lock chat'); }
                  }}>
                    <Icon name="lock" size={17} /><span>Lock conversation</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => {
                    setChatActionsOpen(false); onToggleArchive();
                  }}>
                    <Icon name="archive" size={17} />
                    <span>{archived ? 'Unarchive conversation' : 'Archive conversation'}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => {
                    setChatActionsOpen(false); setSearchOpen((open) => !open);
                  }}>
                    <Icon name="search" size={17} />
                    <span>{searchOpen ? 'Close search' : 'Search conversation'}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => {
                    setChatActionsOpen(false); onToggleInfo();
                  }}>
                    <Icon name="info" size={17} /><span>Conversation details</span>
                  </button>
                  <div className="chat-actions-divider" />
                  <button type="button" role="menuitem" className="danger" onClick={async () => {
                    setChatActionsOpen(false);
                    if (!window.confirm('Delete this chat from your account? Other participants will keep their copy.')) return;
                    try {
                      await apiFetch(`/api/v1/conversations/${conversation.id}`, { method: 'DELETE' });
                      window.location.reload();
                    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete chat'); }
                  }}>
                    <Icon name="trash" size={17} /><span>Delete conversation</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="chat-search">
          <Icon name="search" size={16} />

          <input
            ref={searchInputRef}
            value={search}
            onChange={async (event) => {
              const value = event.target.value;
              setSearch(value);
              setSearchDate('');
              setActiveSearchIndex(0);

              if (!value.trim()) {
                setRemoteResults(null);
                setSearchMatches([]);
                return;
              }

              try {
                const rows = await apiFetch<Message[]>(
                  `/api/v1/conversations/${conversation.id}/search?q=${encodeURIComponent(value)}`
                );
                setRemoteResults(rows);
                setSearchMatches(rows);

                if (rows.length) focusSearchResult(0, rows);
              } catch {
                setRemoteResults([]);
                setSearchMatches([]);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && searchMatches.length) {
                event.preventDefault();
                focusSearchResult(activeSearchIndex + 1, searchMatches);
              } else if (event.key === 'ArrowUp' && searchMatches.length) {
                event.preventDefault();
                focusSearchResult(activeSearchIndex - 1, searchMatches);
              } else if (event.key === 'Enter' && searchMatches.length) {
                event.preventDefault();
                focusSearchResult(activeSearchIndex + 1, searchMatches);
              }
            }}
            placeholder="Search words"
            aria-label="Search messages"
            autoFocus
          />

          <input type="date" aria-label="Search by date" value={searchDate} onChange={(event) => void searchByDate(event.target.value)} />

          {(search || searchDate) && (
            <span className="chat-search-count">
              {filtered.length} result{filtered.length === 1 ? '' : 's'} · {filtered.length ? activeSearchIndex + 1 : 0}/{filtered.length}
            </span>
          )}

          {(search || searchDate) && (
            <div className="chat-search-navigation">
              <button type="button" className="icon-button small" aria-label="Previous search result" disabled={!searchMatches.length} onClick={() => focusSearchResult(activeSearchIndex - 1, searchMatches)}>
                <Icon name="chevronUp" size={15}/>
              </button>
              <button type="button" className="icon-button small" aria-label="Next search result" disabled={!searchMatches.length} onClick={() => focusSearchResult(activeSearchIndex + 1, searchMatches)}>
                <Icon name="chevronDown" size={15}/>
              </button>
            </div>
          )}

          <button type="button" className="icon-button small" onClick={() => {
            setSearch('');
            setSearchDate('');
            setRemoteResults(null);
            setSearchMatches([]);
            setSearchOpen(false);
          }} aria-label="Close search">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <div className={`messages ${selectedMessages.length ? 'has-selection' : ''}`} ref={scrollRef} onScroll={handleMessagesScroll}>
        {selectedMessages.length > 0 && (
          <div className="message-selection-toolbar" role="toolbar" aria-label="Selected message actions">
            <div className="selection-count">
              <span className="selection-check"><Icon name="check" size={13}/></span>
              <strong>{selectedMessages.length}</strong>
              <span>{selectedMessages.length === 1 ? 'message selected' : 'messages selected'}</span>
            </div>

            <button type="button" className="selection-tool" onClick={() => {
              const item = messages.find((m) => m.id === selectedMessages[0]);
              if (item) setInfoMessage(item);
            }}>
              <Icon name="info" size={16}/> Info
            </button>

            <button type="button" className="selection-tool danger" onClick={async () => {
              const items = messages.filter((m) => selectedMessages.includes(m.id) && m.senderId === me.id && !m.deletedAt);

              if (!items.length) {
                toast.error('Only your own messages can be deleted for everyone.');
                return;
              }

              if (!window.confirm(`Delete ${items.length} selected message(s) for everyone?`)) return;

              for (const item of items) {
                await apiFetch(`/api/v1/messages/${item.id}/everyone`, {
                  method: 'DELETE'
                });
              }

              setSelectedMessages([]);
              onRetry();
            }}>
              <Icon name="trash" size={16}/> Delete
            </button>

            <button type="button" className="selection-tool close-selection" onClick={() => setSelectedMessages([])} aria-label="Clear message selection">
              <Icon name="close" size={17}/>
            </button>
          </div>
        )}

        {loading && (
          <div className="message-loading">
            <Spinner label="Loading messages" />
            <span>Loading messages…</span>
          </div>
        )}

        {error && !loading && (
          <div className="inline-error" role="alert">
            <span>{error}</span>
            <button type="button" className="button ghost small" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && !messages.length && (
          <div className="conversation-start">
            <Avatar name={title} size={58} />
            <h2>{title}</h2>
            <p>This is the beginning of your conversation. Say hello!</p>
          </div>
        )}

        {!loading && timelineGroups.map((group) => (
          <div key={group.day} className="message-group" data-chat-day={group.day}>
            <div className="date-separator"><span>{group.day}</span></div>

            {group.items.map((item) => item.kind === 'message' ? (
              <MessageBubble
                key={item.message.id}
                message={item.message}
                me={me}
                showSender={Boolean(showSender && messages[messages.findIndex((m) => m.id === item.message.id) - 1]?.senderId !== item.message.senderId)}
                onDelete={async (message) => {
                  if (!window.confirm('Delete this message for everyone?')) return;

                  try {
                    await apiFetch(`/api/v1/messages/${message.id}/everyone`, {
                      method: 'DELETE'
                    });
                    onRetry();
                  } catch (cause) {
                    toast.error(cause instanceof Error ? cause.message : 'Could not delete message');
                  }
                }}
                onInfo={(message) => setInfoMessage(message)}
                selected={selectedMessages.includes(item.message.id)}
                searchTerm={search}
                onSelect={(message) => setSelectedMessages((current) =>
                  current.includes(message.id)
                    ? current.filter((id) => id !== message.id)
                    : [...current, message.id]
                )}
              />
            ) : (
              <article className={`chat-call-event ${item.call.callerId === me.id ? 'mine' : 'theirs'} ${['NO_RESPONSE','REJECTED'].includes(item.call.status) ? 'missed' : ''}`} key={item.call.id}>
                <span className={`chat-call-event-icon ${['NO_RESPONSE','REJECTED'].includes(item.call.status) ? 'missed' : ''}`}>
                  <Icon name="phone" size={18}/>
                </span>

                <span className="chat-call-event-copy">
                  <strong>{item.call.mode === 'video' ? 'Video call' : 'Voice call'}</strong>
                  <small>
                    {item.call.status === 'NO_RESPONSE'
                      ? (item.call.callerId === me.id ? 'No answer' : 'Missed call')
                      : item.call.status === 'REJECTED'
                        ? (item.call.callerId === me.id ? 'Declined' : 'You declined')
                        : item.call.durationSeconds > 0
                          ? `${item.call.durationSeconds} secs`
                          : item.call.status === 'RINGING'
                            ? 'Ringing'
                            : item.call.status === 'CONNECTED' || item.call.status === 'ACCEPTED'
                              ? 'Connected'
                              : 'Call ended'}
                  </small>
                </span>

                <time>{formatTime(item.call.createdAt)}</time>

                <button type="button" className="icon-button small" title="Delete call from my history" aria-label="Delete call from my history" onClick={async () => {
                  try {
                    await apiFetch(`/api/v1/calls/${item.call.id}/history`, {
                      method: 'DELETE'
                    });
                    setCallHistory((current) => current.filter((call) => call.id !== item.call.id));
                  } catch (cause) {
                    toast.error(cause instanceof Error ? cause.message : 'Could not delete call');
                  }
                }}>
                  <Icon name="trash" size={14}/>
                </button>
              </article>
            ))}
          </div>
        ))}

        {!loading && (search || searchDate) && !timelineGroups.length && (
          <div className="sidebar-empty">
            <p>No messages or calls match this search.</p>
          </div>
        )}

        {typingUsers.length > 0 && (
          <div className="typing-indicator" aria-live="polite">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            {typingUsers.length === 1 ? `${typingUsers[0]} is typing…` : `${typingUsers.length} people are typing…`}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <footer className="composer">
        {!connected && <div className="composer-offline">Reconnecting… messages may be delayed.</div>}

        <div className="composer-row">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAndSend(file);
              event.currentTarget.value = '';
            }}
          />

          <button type="button" className="icon-button" aria-label="Attach image, video or file" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Icon name="paperclip" size={18} />
          </button>

          <button type="button" className={`icon-button ${recording ? 'active' : ''}`} aria-label={recording ? 'Stop voice recording' : 'Record voice message'} disabled={uploading} onClick={() => void toggleRecording()}>
            <Icon name="mic" size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              onTyping?.();
              event.target.style.height = 'auto';
              event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={`Message ${title}…`}
            aria-label="Message text"
          />

          <button type="button" className="button primary send-button" onClick={submit} disabled={!draft.trim() || uploading} aria-label="Send message">
            <Icon name="send" size={18} />
            <span>Send</span>
          </button>
        </div>

        <span className="composer-hint">Enter to send · Shift + Enter for a new line</span>
      </footer>

      {callMode && (
        <CallPanel
          conversationId={conversation.id}
          mode={callMode}
          notifyParticipants={callNotify}
          callId={activeCallId}
          onClose={() => {
            setCallMode(null);
            setActiveCallId(undefined);
            window.setTimeout(() => {
              apiFetch<typeof callHistory>(`/api/v1/conversations/${conversation.id}/calls`)
                .then(setCallHistory)
                .catch(() => undefined);
            }, 500);
          }}
        />
      )}

      {infoMessage && (
        <div className="message-info-overlay" role="dialog" aria-modal="true">
          <section className="message-info-card">
            <header>
              <strong>Message info</strong>
              <button className="icon-button" onClick={() => setInfoMessage(null)} aria-label="Close">
                <Icon name="close" />
              </button>
            </header>

            <p className="muted">Sent · {new Date(infoMessage.createdAt).toLocaleString()}</p>

            {(infoMessage.receipts || []).map((receipt) => {
              const member = conversation.members.find((entry) => entry.user.id === receipt.userId)?.user;

              return (
                <div className="message-info-row" key={receipt.userId}>
                  <strong>{member?.displayName || member?.username || 'Participant'}</strong>
                  <span>Delivered: {receipt.deliveredAt ? new Date(receipt.deliveredAt).toLocaleString() : 'Pending'}</span>
                  <span>Read: {receipt.readAt ? new Date(receipt.readAt).toLocaleString() : 'Unread'}</span>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </section>
  );
}