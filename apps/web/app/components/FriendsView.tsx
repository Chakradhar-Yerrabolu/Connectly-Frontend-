'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/api';
import type { Friend, FriendRequest, User } from '../lib/types';
import { useToast } from '../providers';
import { Icon } from './Icon';
import { Avatar, Badge, EmptyState, Spinner } from './ui';

type SearchResult = {
  found: boolean;
  user: User;
  relationship: string;
  request: FriendRequest | null;
};

const relationshipCopy: Record<string, string> = {
  NONE: 'Not connected',
  SENT: 'Request sent',
  RECEIVED: 'Request received',
  ACCEPTED: 'Friends',
  REJECTED: 'Request declined',
  CANCELLED: 'Request cancelled',
  SELF: 'This is you',
  BLOCKED: 'Unavailable',
};

export function FriendsView({
  friends,
  onlineUsers,
  onRefresh,
  onStartChat,
  onViewProfile,
  onGoRequests,
}: {
  friends: Friend[];
  onlineUsers: Set<string>;
  onRefresh: () => Promise<void>;
  onStartChat: (username: string) => Promise<void>;
  onViewProfile: (username: string) => void;
  onGoRequests: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [notFound, setNotFound] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; user: User; createdAt: string }[]>([]);

  async function loadBlockedUsers() {
    try { setBlockedUsers(await apiFetch<{ id: string; user: User; createdAt: string }[]>('/api/v1/users/blocked')); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load blocked users', 'blocked-users-load-error'); }
  }
  useEffect(() => { void loadBlockedUsers(); }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    setNotFound('');
    setResult(null);
    try {
      const data = await apiFetch<SearchResult>(`/api/v1/users/search?q=${encodeURIComponent(term)}`);
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      setNotFound(message === 'User not found' ? `No user found with the username “${term}”. Usernames are case-sensitive.` : message);
      toast.error(message, 'friend-search-error');
    } finally {
      setSearching(false);
    }
  }

  async function addFriend(username: string) {
    setBusy(true);
    try {
      await apiFetch('/api/v1/friend-requests', { method: 'POST', body: { username } });
      toast.success(`Friend request sent to @${username}.`, `request-sent-${username}`, 'Request sent');
      if (result) setResult({ ...result, relationship: 'SENT' });
      await onRefresh();
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === 'OPPOSITE_PENDING') {
        toast.info(`@${username} already sent you a request. Accept it from Friend Requests.`, 'opposite-pending', 'Request waiting');
        if (result) setResult({ ...result, relationship: 'RECEIVED' });
        onGoRequests();
      } else if (apiError.code === 'ALREADY_FRIENDS') {
        toast.info(`You are already friends with @${username}.`, `already-friends-${username}`);
        if (result) setResult({ ...result, relationship: 'ACCEPTED' });
      } else {
        toast.error(apiError.message || 'Could not send request', 'friend-request-error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function acceptRequest(request: FriendRequest) {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/friend-requests/${request.id}/accept`, { method: 'POST' });
      toast.success(`You are now friends with @${request.sender.username}.`, `friend-accepted-${request.id}`, 'Friend added');
      if (result) setResult({ ...result, relationship: 'ACCEPTED' });
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept request', 'friend-accept-error');
    } finally {
      setBusy(false);
    }
  }

  async function rejectRequest(request: FriendRequest) {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/friend-requests/${request.id}/reject`, { method: 'POST' });
      toast.info('Friend request rejected.', `friend-rejected-${request.id}`);
      if (result) setResult({ ...result, relationship: 'REJECTED' });
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject request', 'friend-reject-error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest(request: FriendRequest) {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/friend-requests/${request.id}/cancel`, { method: 'POST' });
      toast.info('Friend request cancelled.', `friend-cancelled-${request.id}`);
      if (result) setResult({ ...result, relationship: 'CANCELLED' });
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not cancel request', 'friend-cancel-error');
    } finally {
      setBusy(false);
    }
  }

  async function blockUser(username: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(username)}/block`, { method: 'POST' });
      toast.success(`@${username} has been blocked.`, `blocked-${username}`, 'User blocked');
      if (result) setResult({ ...result, relationship: 'BLOCKED' });
      await Promise.all([onRefresh(), loadBlockedUsers()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not block user', 'block-error');
    } finally {
      setBusy(false);
    }
  }

  async function unblockUser(username: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(username)}/block`, { method: 'DELETE' });
      setBlockedUsers((current) => current.filter((row) => row.user.username !== username));
      if (result?.user.username === username) setResult({ ...result, relationship: 'NONE' });
      toast.success(`@${username} has been unblocked.`, `unblocked-${username}`);
      await onRefresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not unblock user', 'unblock-error'); }
    finally { setBusy(false); }
  }

  async function reportUser(username: string) {
    const category = window.prompt('Report category: HARASSMENT, THREATS, SPAM_SCAM, IMPERSONATION, INAPPROPRIATE_CONTENT, HATE_SPEECH, OTHER', 'OTHER');
    if (!category) return;
    const allowed = ['HARASSMENT', 'THREATS', 'SPAM_SCAM', 'IMPERSONATION', 'INAPPROPRIATE_CONTENT', 'HATE_SPEECH', 'OTHER'];
    if (!allowed.includes(category.trim().toUpperCase())) { toast.error('Choose one of the listed report categories.', 'report-category-invalid'); return; }
    const description = window.prompt(`Describe why you are reporting @${username} (at least 10 characters):`);
    if (!description || description.trim().length < 10) return;
    setBusy(true);
    try {
      await apiFetch('/api/v1/reports', { method: 'POST', body: { reportedUsername: username, category: category.trim().toUpperCase(), description: description.trim() } });
      toast.success(`Your report about @${username} was submitted for review.`, `report-submitted-${username}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not submit report', 'report-submit-error'); }
    finally { setBusy(false); }
  }

  return (
    <section className="content-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Network</p>
          <h1>Friends</h1>
          <p className="muted">Find people by exact username, review requests and start conversations.</p>
        </div>
        <button type="button" className="button primary" onClick={onGoRequests}>
          <Icon name="userPlus" size={17} /> Friend requests
        </button>
      </header>

      <div className="friends-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Find people</h2>
            <span className="panel-note">Case-sensitive exact username</span>
          </div>
          <form className="inline-search" onSubmit={search}>
            <label className="search-field grow">
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by exact username" aria-label="Search users by exact username" />
            </label>
            <button type="submit" className="button secondary" disabled={searching || !query.trim()}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>

          {searching && (
            <div className="panel-loading">
              <Spinner label="Searching users" /> Searching…
            </div>
          )}
          {notFound && <p className="panel-message">{notFound}</p>}

          {result && (
            <article className="person-card">
              <Avatar name={result.user.displayName} pictureKey={result.user.profilePictureKey} size={52} />
              <div className="person-copy">
                <strong>{result.user.displayName}</strong>
                <small>@{result.user.username}</small>
                <span className={`relationship relationship-${result.relationship.toLowerCase()}`}>{relationshipCopy[result.relationship] || result.relationship}</span>
              </div>
              <div className="person-actions">
                {result.relationship === 'NONE' || result.relationship === 'REJECTED' || result.relationship === 'CANCELLED' ? (
                  <button type="button" className="button primary small" disabled={busy} onClick={() => addFriend(result.user.username)}>
                    Add friend
                  </button>
                ) : null}
                {result.relationship === 'SENT' && result.request && (
                  <button type="button" className="button secondary small" disabled={busy} onClick={() => cancelRequest(result.request!)}>
                    Cancel request
                  </button>
                )}
                {result.relationship === 'RECEIVED' && result.request && (
                  <>
                    <button type="button" className="button primary small" disabled={busy} onClick={() => acceptRequest(result.request!)}>
                      Accept
                    </button>
                    <button type="button" className="button ghost small" disabled={busy} onClick={() => rejectRequest(result.request!)}>
                      Reject
                    </button>
                  </>
                )}
                {result.relationship === 'ACCEPTED' && (
                  <button type="button" className="button primary small" onClick={() => onStartChat(result.user.username)}>
                    <Icon name="message" size={15} /> Message
                  </button>
                )}
                {result.relationship !== 'SELF' && result.relationship !== 'BLOCKED' && (
                  <button type="button" className="button ghost small" onClick={() => onViewProfile(result.user.username)}>
                    View profile
                  </button>
                )}
                {result.relationship !== 'SELF' && !blockedUsers.some((row) => row.user.username === result.user.username) && (
                  <button type="button" className="button danger-ghost small" disabled={busy} onClick={() => blockUser(result.user.username)}>Block</button>
                )}
                {result.relationship !== 'SELF' && blockedUsers.some((row) => row.user.username === result.user.username) && (
                  <button type="button" className="button secondary small" disabled={busy} onClick={() => unblockUser(result.user.username)}>Unblock</button>
                )}
                {result.relationship !== 'SELF' && (
                  <button type="button" className="button ghost small" disabled={busy} onClick={() => reportUser(result.user.username)}>Report</button>
                )}
              </div>
            </article>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Your friends <Badge count={friends.length} /></h2>
            <span className="panel-note">{friends.filter((friend) => friend.online || onlineUsers.has(friend.friend.id)).length} online</span>
          </div>
          {!friends.length ? (
            <EmptyState icon="users" title="No friends yet" description="Search for someone by their exact username and send a friend request." />
          ) : (
            <ul className="friend-list">
              {friends.map(({ friend, friendshipId, since }) => {
                const online = friend.online || onlineUsers.has(friend.id);
                return (
                  <li key={friendshipId} className="friend-item">
                    <Avatar name={friend.displayName} pictureKey={friend.profilePictureKey} size={44} online={online} />
                    <div className="person-copy">
                      <strong>{friend.displayName}</strong>
                      <small>@{friend.username} · friends since {new Date(since).toLocaleDateString()}</small>
                    </div>
                    <div className="friend-actions">
                      <button type="button" className="button secondary small" onClick={() => onStartChat(friend.username)}>
                        <Icon name="message" size={15} /> Message
                      </button>
                      <button type="button" className="icon-button" onClick={() => onViewProfile(friend.username)} aria-label={`View ${friend.username}'s profile`}>
                        <Icon name="user" size={17} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="panel blocked-users-panel">
        <div className="panel-head"><h2>Blocked users <Badge count={blockedUsers.length} /></h2><span className="panel-note">Only you can see this list</span></div>
        {!blockedUsers.length ? <p className="panel-message">You have not blocked anyone.</p> : <ul className="friend-list">{blockedUsers.map((row) => <li className="friend-item" key={row.id}><Avatar name={row.user.displayName} pictureKey={row.user.profilePictureKey} size={42}/><div className="person-copy"><strong>{row.user.displayName}</strong><small>@{row.user.username} · blocked {new Date(row.createdAt).toLocaleDateString()}</small></div><button type="button" className="button secondary small" disabled={busy} onClick={() => unblockUser(row.user.username)}>Unblock</button></li>)}</ul>}
      </section>
    </section>
  );
}
