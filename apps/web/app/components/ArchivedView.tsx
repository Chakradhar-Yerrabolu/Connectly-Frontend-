'use client';

import type { Conversation, User } from '../lib/types';
import { Icon } from './Icon';
import { Avatar, EmptyState } from './ui';

function nameFor(conversation: Conversation, me: User) {
  return conversation.title || conversation.members.find((member) => member.user.id !== me.id)?.user.displayName || 'Conversation';
}

function lastMessage(conversation: Conversation) {
  const message = conversation.messages?.[0];
  return message?.body || (message ? `[${message.type.toLowerCase()}]` : 'No messages yet');
}

export function ArchivedView({
  conversations,
  me,
  onOpen,
  onUnarchive,
}: {
  conversations: Conversation[];
  me: User;
  onOpen: (id: string) => void;
  onUnarchive: (id: string) => void;
}) {
  return (
    <section className="content-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Storage</p>
          <h1>Archived chats</h1>
          <p className="muted">Archived conversations stay out of your main list but keep all messages.</p>
        </div>
      </header>
      <section className="panel">
        {!conversations.length ? (
          <EmptyState
            icon="archive"
            title="Nothing archived"
            description="Archive a conversation from the chat header to move it here."
          />
        ) : (
          <ul className="archive-list">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Avatar name={nameFor(conversation, me)} size={44} />
                <div className="person-copy">
                  <strong>{nameFor(conversation, me)}</strong>
                  <small>{lastMessage(conversation)}</small>
                </div>
                <div className="person-actions">
                  <button type="button" className="button secondary small" onClick={() => onOpen(conversation.id)}>
                    Open
                  </button>
                  <button type="button" className="button ghost small" onClick={() => onUnarchive(conversation.id)}>
                    <Icon name="archive" size={15} /> Unarchive
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
