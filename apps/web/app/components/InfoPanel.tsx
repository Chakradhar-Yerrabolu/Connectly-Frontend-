'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Conversation, User } from '../lib/types';
import { Icon } from './Icon';
import { Avatar } from './ui';

export function InfoPanel({
  conversation,
  me,
  onlineUsers,
  onClose,
  onViewProfile,
  onBlock,
}: {
  conversation: Conversation;
  me: User;
  onlineUsers: Set<string>;
  onClose: () => void;
  onViewProfile: (username: string) => void;
  onBlock: (username: string, currentlyBlocked: boolean) => Promise<void> | void;
}) {
  const other = conversation.members.find((member) => member.user.id !== me.id)?.user;
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (conversation.type === 'DIRECT' && other) {
      apiFetch<{ user: User }[]>('/api/v1/users/blocked').then((rows) => {
        if (active) setIsBlocked(rows.some((row) => row.user.id === other.id));
      }).catch(() => undefined);
    } else setIsBlocked(false);
    return () => { active = false; };
  }, [conversation.id, conversation.type, other?.id]);
  const title = conversation.title || other?.displayName || other?.username || 'Conversation';

  return (
    <aside className="info-panel" aria-label="Conversation details">
      <header className="info-head">
        <h2>Details</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="info-profile">
        <Avatar name={title} pictureKey={other?.profilePictureKey} size={72} online={conversation.type === 'DIRECT' ? (other ? onlineUsers.has(other.id) : false) : undefined} />
        <h3>{title}</h3>
        {conversation.type === 'DIRECT' && other && (
          <button type="button" className="link-button" onClick={() => onViewProfile(other.username)}>
            @{other.username}
          </button>
        )}
        {conversation.type === 'DIRECT' && other && (
          <span className={`status-line ${onlineUsers.has(other.id) ? 'online' : ''}`}>
            <span className="presence-dot" /> {onlineUsers.has(other.id) ? 'Online now' : 'Offline'}
          </span>
        )}
        {conversation.type === 'GROUP' && <span className="status-line">{conversation.members.length} members</span>}
      </div>

      {conversation.type === 'DIRECT' && other?.about && (
        <section className="info-section">
          <h4>About</h4>
          <p>{other.about}</p>
        </section>
      )}

      <section className="info-section">
        <h4>Members</h4>
        <ul className="member-list">
          {conversation.members.map((member) => (
            <li key={member.user.id}>
              <Avatar name={member.user.displayName} pictureKey={member.user.profilePictureKey} size={34} online={onlineUsers.has(member.user.id)} />
              <div>
                <strong>{member.user.displayName}{member.user.id === me.id ? ' (you)' : ''}</strong>
                <small>@{member.user.username}</small>
              </div>
              {member.role === 'ADMIN' && <span className="tag">Admin</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="info-section">
        <h4>Conversation</h4>
        <button type="button" className="info-action">
          <Icon name="search" size={17} /> Search messages
        </button>
        <button type="button" className="info-action">
          <Icon name="archive" size={17} /> Archive chat
        </button>
        {conversation.type === 'DIRECT' && other && (
          <>
            <button type="button" className={`info-action ${isBlocked ? '' : 'danger'}`} disabled={blockBusy} onClick={async () => {
              setBlockBusy(true);
              try { await onBlock(other.username, isBlocked); setIsBlocked(!isBlocked); }
              finally { setBlockBusy(false); }
            }}>
              <Icon name="shield" size={17} /> {blockBusy ? 'Please wait…' : isBlocked ? `Unblock @${other.username}` : `Block @${other.username}`}
            </button>
            <button type="button" className="info-action danger" onClick={() => window.location.assign(`/report/${encodeURIComponent(other.username)}`)}>
              <Icon name="flag" size={17} /> Report @{other.username}
            </button>
          </>
        )}
      </section>
      <p className="info-note">Messages are stored on the Connectly server and are not end-to-end encrypted.</p>
    </aside>
  );
}
