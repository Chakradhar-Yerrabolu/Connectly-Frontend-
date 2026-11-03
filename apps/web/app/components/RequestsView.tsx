'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/api';
import type { FriendRequest } from '../lib/types';
import { useToast } from '../providers';
import { Icon } from './Icon';
import { Avatar, Badge, EmptyState } from './ui';

function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function FriendRequestCard({
  request,
  direction,
  busy,
  onAccept,
  onReject,
  onCancel,
  onViewProfile,
}: {
  request: FriendRequest;
  direction: 'incoming' | 'outgoing';
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  onViewProfile: () => void;
}) {
  const person = direction === 'incoming' ? request.sender : request.receiver;
  const pending = request.status === 'PENDING';
  return (
    <article className={`request-card ${pending ? 'pending' : ''}`}>
      <Avatar name={person.displayName} size={48} />
      <div className="person-copy">
        <strong>{person.displayName}</strong>
        <small>@{person.username}</small>
        <span className={`relationship relationship-${request.status.toLowerCase()}`}>{statusLabel(request.status)}</span>
        <span className="request-time">
          {direction === 'incoming' ? 'Wants to connect' : 'You sent a request'} · {new Date(request.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="person-actions">
        <button type="button" className="button ghost small" onClick={onViewProfile}>
          View profile
        </button>
        {pending && direction === 'incoming' && (
          <>
            <button type="button" className="button primary small" disabled={busy} onClick={onAccept}>
              <Icon name="check" size={15} /> Accept
            </button>
            <button type="button" className="button danger-ghost small" disabled={busy} onClick={onReject}>
              Reject
            </button>
          </>
        )}
        {pending && direction === 'outgoing' && (
          <button type="button" className="button secondary small" disabled={busy} onClick={onCancel}>
            Cancel request
          </button>
        )}
      </div>
    </article>
  );
}

export function RequestsView({
  requests,
  onRefresh,
  onViewProfile,
  onFindFriends,
}: {
  requests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  onRefresh: () => Promise<void>;
  onViewProfile: (username: string) => void;
  onFindFriends: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [busyId, setBusyId] = useState('');
  const list = (tab === 'incoming' ? requests.incoming : requests.outgoing).filter((request) => request.status === 'PENDING');
  const pendingIncoming = requests.incoming.filter((request) => request.status === 'PENDING').length;

  async function act(id: string, action: 'accept' | 'reject' | 'cancel', username: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/friend-requests/${id}/${action}`, { method: 'POST' });
      if (action === 'accept') toast.success(`You are now friends with @${username}.`, `accepted-${id}`, 'Friend added');
      else if (action === 'reject') toast.info('Friend request rejected.', `rejected-${id}`);
      else toast.info('Friend request cancelled.', `cancelled-${id}`);
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed', `request-${action}-error`);
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="content-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h1>Friend requests <Badge count={pendingIncoming} /></h1>
          <p className="muted">Accept people you know, reject unwanted requests, or cancel requests you sent.</p>
        </div>
        <button type="button" className="button primary" onClick={onFindFriends}>
          <Icon name="plus" size={17} /> Find friends
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Friend request direction">
        <button type="button" role="tab" aria-selected={tab === 'incoming'} className={tab === 'incoming' ? 'active' : ''} onClick={() => setTab('incoming')}>
          Incoming <Badge count={requests.incoming.filter((request) => request.status === 'PENDING').length} />
        </button>
        <button type="button" role="tab" aria-selected={tab === 'outgoing'} className={tab === 'outgoing' ? 'active' : ''} onClick={() => setTab('outgoing')}>
          Outgoing <Badge count={requests.outgoing.filter((request) => request.status === 'PENDING').length} />
        </button>
      </div>

      <section className="panel">
        {!list.length ? (
          <EmptyState
            icon="userPlus"
            title={tab === 'incoming' ? 'No incoming requests' : 'No outgoing requests'}
            description={tab === 'incoming' ? 'When someone sends you a friend request it will appear here.' : 'Requests you send will appear here until they are accepted.'}
            action={
              <button type="button" className="button secondary" onClick={onFindFriends}>
                Find friends
              </button>
            }
          />
        ) : (
          <div className="request-list">
            {list.map((request) => {
              const person = tab === 'incoming' ? request.sender : request.receiver;
              return (
                <FriendRequestCard
                  key={request.id}
                  request={request}
                  direction={tab}
                  busy={busyId === request.id}
                  onAccept={() => act(request.id, 'accept', person.username)}
                  onReject={() => act(request.id, 'reject', person.username)}
                  onCancel={() => act(request.id, 'cancel', person.username)}
                  onViewProfile={() => onViewProfile(person.username)}
                />
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
