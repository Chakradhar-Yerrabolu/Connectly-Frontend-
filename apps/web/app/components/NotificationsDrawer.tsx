'use client';

import type { Notification } from '../lib/types';
import { Icon } from './Icon';
import { Badge, EmptyState } from './ui';

function timeAgo(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function iconFor(type: string) {
  if (type === 'FRIEND_REQUEST') return 'userPlus' as const;
  if (type === 'FRIEND_REQUEST_ACCEPTED') return 'users' as const;
  if (type === 'NEW_MESSAGE') return 'message' as const;
  return 'bell' as const;
}

export function NotificationsDrawer({
  open,
  notifications,
  unreadCount,
  onClose,
  onMarkAll,
  onSelect,
}: {
  open: boolean;
  notifications: Notification[];
  unreadCount: number;
  onClose: () => void;
  onMarkAll: () => void;
  onSelect: (notification: Notification) => void;
}) {
  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`notifications-drawer ${open ? 'open' : ''}`} aria-label="Notifications" aria-hidden={!open}>
        <header className="drawer-head">
          <div>
            <h2>
              Notifications <Badge count={unreadCount} />
            </h2>
            <p>Updates stay here until you read them.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close notifications">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="drawer-actions">
          <button type="button" className="button ghost small" onClick={onMarkAll} disabled={!unreadCount}>
            Mark all as read
          </button>
        </div>
        <div className="drawer-list">
          {!notifications.length ? (
            <EmptyState icon="bell" title="No notifications" description="Friend requests, accepted invites and new messages will appear here." />
          ) : (
            notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={`notification-item ${notification.readAt ? '' : 'unread'}`}
                onClick={() => onSelect(notification)}
              >
                <span className={`notification-icon type-${notification.type.toLowerCase()}`}>
                  <Icon name={iconFor(notification.type)} size={17} />
                </span>
                <span className="notification-copy">
                  <strong>{notification.title}</strong>
                  {notification.body && <span>{notification.body}</span>}
                  <small>{timeAgo(notification.createdAt)}</small>
                </span>
                {!notification.readAt && <span className="unread-dot" aria-label="Unread" />}
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
