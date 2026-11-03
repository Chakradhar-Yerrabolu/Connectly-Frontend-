'use client';

import type { Conversation, User } from '../lib/types';
import { Icon } from './Icon';
import { Avatar, EmptyState } from './ui';

function groupPreview(conversation: Conversation) {
  const message = conversation.messages?.[0];
  if (!message) return 'No messages yet';
  return message.body || `[${message.type.toLowerCase()}]`;
}

export function GroupsView({
  groups,
  me,
  onOpen,
  onCreate,
}: {
  groups: Conversation[];
  me: User;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className="content-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Communities</p>
          <h1>Groups</h1>
          <p className="muted">Keep projects, teams and friend circles in one conversation.</p>
        </div>
        <button type="button" className="button primary" onClick={onCreate}>
          <Icon name="plus" size={17} /> Create group
        </button>
      </header>
      {!groups.length ? (
        <section className="panel">
          <EmptyState
            icon="group"
            title="No groups yet"
            description="Create a group with your friends and start a shared conversation."
            action={
              <button type="button" className="button secondary" onClick={onCreate}>
                Create your first group
              </button>
            }
          />
        </section>
      ) : (
        <div className="group-grid">
          {groups.map((group) => (
            <article key={group.id} className="group-card">
              <div className="group-card-head">
                <Avatar name={group.title || 'Group'} size={50} />
                <div>
                  <strong>{group.title || 'Untitled group'}</strong>
                  <small>{group.members.length} members</small>
                </div>
              </div>
              <p>{groupPreview(group)}</p>
              <div className="group-members">
                {group.members.slice(0, 5).map((member) => (
                  <Avatar key={member.user.id} name={member.user.displayName} size={26} />
                ))}
                {group.members.length > 5 && <span className="group-more">+{group.members.length - 5}</span>}
              </div>
              <button type="button" className="button secondary" onClick={() => onOpen(group.id)}>
                Open group
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="muted content-note">You are a member of {groups.length} group{groups.length === 1 ? '' : 's'}. Groups include everyone listed, and messages are visible to all members.</p>
      <span className="sr-only">Signed in as {me.username}</span>
    </section>
  );
}
