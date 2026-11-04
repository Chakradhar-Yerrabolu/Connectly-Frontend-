'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, Friend, FriendRequest, Notification, User, View } from '../lib/types';
import { Icon, type IconName } from './Icon';
import { Avatar, Badge, ThemeSelector } from './ui';
import { apiFetch } from '../lib/api';

const navItems: { view: View; label: string; icon: IconName }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: 'spark' },
  { view: 'chats', label: 'Chats', icon: 'chat' },
  { view: 'friends', label: 'Friends', icon: 'users' },
  { view: 'requests', label: 'Friend Requests', icon: 'userPlus' },
  { view: 'groups', label: 'Groups', icon: 'group' },
  { view: 'archived', label: 'Archived Chats', icon: 'archive' },
  { view: 'calls', label: 'Call History', icon: 'callHistory' },
  { view: 'profile', label: 'Profile', icon: 'user' },
  { view: 'notifications', label: 'Notifications', icon: 'bell' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

function conversationName(conversation: Conversation, meId: string) {
  if (conversation.title) return conversation.title;
  const other = conversation.members.find((member) => member.user.id !== meId)?.user;
  return other?.displayName || other?.username || 'Conversation';
}

function conversationUser(conversation: Conversation, meId: string) {
  return conversation.members.find((member) => member.user.id !== meId)?.user;
}

function preview(conversation: Conversation) {
  const message = conversation.messages?.[0];
  if (!message) return 'No messages yet';
  const label = message.body?.trim();
  if (label) return label;
  return message.type === 'TEXT' ? 'No messages yet' : `[${message.type.toLowerCase()}]`;
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function Sidebar({
  view,
  onView,
  me,
  conversations,
  friends,
  requests,
  archived,
  selectedId,
  unreadNotifications,
  unreadByConversation,
  unreadTotal,
  onlineUsers,
  onSelectConversation,
  onNewChat,
  onNotifications,
  onLogout,
  onLogoutAll,
  onUnlockConversation,
}: {
  view: View;
  onView: (view: View) => void;
  me: User;
  conversations: Conversation[];
  friends: Friend[];
  requests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  archived: Conversation[];
  selectedId: string;
  unreadNotifications: number;
  unreadByConversation: Record<string, number>;
  unreadTotal: number;
  onlineUsers: Set<string>;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onNotifications: () => void;
  onLogout: () => void;
  onLogoutAll: () => void;
  onUnlockConversation: (conversation: Conversation) => void;
}) {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(''), [view]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const groups = useMemo(() => conversations.filter((conversation) => conversation.type === 'GROUP'), [conversations]);
  const directChats = conversations;

  const visibleConversations = useMemo(() => {
    const source = view === 'groups' ? groups : view === 'archived' ? archived : directChats;
    const term = query.trim().toLowerCase();
    if (!term) return [...source].sort((a, b) => Number(Boolean(b.members.find((m) => m.user.id === me.id)?.isFavorite)) - Number(Boolean(a.members.find((m) => m.user.id === me.id)?.isFavorite)));
    return source.filter((conversation) => {
      const name = conversationName(conversation, me.id).toLowerCase();
      return name.includes(term) || preview(conversation).toLowerCase().includes(term);
    });
  }, [view, groups, directChats, archived, query, me.id]);

  const visibleFriends = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return friends;
    return friends.filter(({ friend }) => friend.displayName.toLowerCase().includes(term) || friend.username.toLowerCase().includes(term));
  }, [friends, query]);

  const visibleIncoming = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pending = requests.incoming.filter((request) => request.status === 'PENDING');
    if (!term) return pending;
    return pending.filter((request) => request.sender.displayName.toLowerCase().includes(term) || request.sender.username.toLowerCase().includes(term));
  }, [requests.incoming, query]);

  const sectionCopy: Record<string, { title: string; placeholder: string }> = {
    chats: { title: 'Messages', placeholder: 'Search conversations' },
    friends: { title: 'Friends', placeholder: 'Search friends' },
    requests: { title: 'Pending requests', placeholder: 'Search requests' },
    groups: { title: 'Groups', placeholder: 'Search groups' },
    archived: { title: 'Archived', placeholder: 'Search archived chats' },
    calls: { title: 'Call History', placeholder: 'Recent calls' },
    settings: { title: 'General', placeholder: 'Search settings' },
    profile: { title: 'Profile', placeholder: 'Profile details' },
    notifications: { title: 'Notifications', placeholder: 'Search notifications' },
  };
  const copy = sectionCopy[view] || sectionCopy.chats;

  function renderConversationList() {
    if (!visibleConversations.length) {
      return (
        <div className="sidebar-empty">
          <p>{view === 'archived' ? 'No archived chats.' : view === 'groups' ? 'No groups yet.' : 'No conversations yet.'}</p>
          {view === 'chats' && (
            <button type="button" className="link-button" onClick={onNewChat}>
              Start a conversation
            </button>
          )}
        </div>
      );
    }
    return visibleConversations.map((conversation) => {
      const other = conversationUser(conversation, me.id);
      const name = conversationName(conversation, me.id);
      const isOnline = other ? onlineUsers.has(other.id) : false;
      return (
        <button
          type="button"
          key={conversation.id}
          className={`chat-row ${selectedId === conversation.id ? 'active' : ''}`}
          onClick={() => onSelectConversation(conversation.id)}
        >
          <Avatar name={name} pictureKey={other?.profilePictureKey} size={44} online={conversation.type === 'GROUP' ? undefined : isOnline} />
          <span className="chat-row-body">
            <span className="chat-row-top">
              <strong>{name} {conversation.members.find((member) => member.user.id === me.id)?.isFavorite && <span className="favorite-star" aria-label="Favourite">★</span>}</strong>
              <small>{formatTime(conversation.messages?.[0]?.createdAt || conversation.updatedAt)}</small>
            </span>
            <span className="chat-row-bottom">
              <span>{preview(conversation)}</span>
              <Badge count={unreadByConversation[conversation.id]} label={`${unreadByConversation[conversation.id] || 0} unread messages`} />
            </span>
          </span>
        </button>
      );
    });
  }

  function renderFriends() {
    if (!visibleFriends.length) return <div className="sidebar-empty"><p>No friends yet. Find people using exact usernames.</p></div>;
    return visibleFriends.map(({ friend, friendshipId }) => (
      <button type="button" key={friendshipId} className="chat-row friend-row" onClick={() => onView('friends')}>
        <Avatar name={friend.displayName} pictureKey={friend.profilePictureKey} size={42} online={friend.online || onlineUsers.has(friend.id)} />
        <span className="chat-row-body">
          <span className="chat-row-top">
            <strong>{friend.displayName}</strong>
          </span>
          <span className="chat-row-bottom">
            <span>@{friend.username}</span>
          </span>
        </span>
      </button>
    ));
  }

  function renderRequests() {
    if (!visibleIncoming.length) return <div className="sidebar-empty"><p>No pending incoming requests.</p></div>;
    return visibleIncoming.map((request) => (
      <button type="button" key={request.id} className="chat-row" onClick={() => onView('requests')}>
        <Avatar name={request.sender.displayName} pictureKey={request.sender.profilePictureKey} size={42} />
        <span className="chat-row-body">
          <span className="chat-row-top">
            <strong>{request.sender.displayName}</strong>
            <small>New</small>
          </span>
          <span className="chat-row-bottom">
            <span>wants to connect</span>
          </span>
        </span>
      </button>
    ));
  }

  return (
    <aside className="sidebar" aria-label="Application navigation">
      <header className="sidebar-top">
        <button type="button" className="brand brand-button" onClick={() => onView('chats')} aria-label="Connectly home">
          connectly<span>.</span>
        </button>
        <div className="sidebar-actions">
          <ThemeSelector compact />
          <button type="button" className="icon-button has-badge" onClick={onNotifications} aria-label={`Notifications (${unreadNotifications} unread)`}>
            <Icon name="bell" size={19} />
            <Badge count={unreadNotifications} />
          </button>
          <button type="button" className="icon-button primary-icon" onClick={onNewChat} aria-label="Start a new conversation">
            <Icon name="plus" size={19} />
          </button>
        </div>
      </header>

      <nav className="primary-nav" aria-label="Main sections">
        {navItems.map((item) => {
          const badge = item.view === 'requests' ? requests.incoming.filter((request) => request.status === 'PENDING').length : item.view === 'chats' ? unreadTotal : 0;
          return (
            <button key={item.view} type="button"
              className={`nav-item ${view === item.view ? 'active' : ''}`}
              onClick={() => onView(item.view)} aria-label={item.label} title={item.label}
              aria-current={view === item.view ? 'page' : undefined}>
              <Icon name={item.icon} size={20} />
              <Badge count={badge} />
            </button>
          );
        })}
      </nav>

      <div className="sidebar-section">
        <div className="section-heading">
          <h2>{copy.title}</h2>
          {view === 'chats' && (
            <button type="button" className="icon-button small" onClick={onNewChat} aria-label="New chat">
              <Icon name="plus" size={16} />
            </button>
          )}
        </div>
        {['chats', 'groups', 'archived'].includes(view) && (
          <label className="search-field">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={async (event) => { if (event.key !== "Enter" || view !== "chats" || !query.trim()) return; try { const conversation = await apiFetch<Conversation>("/api/v1/conversations/unlock", { method: "POST", body: { secret: query.trim() } }); onUnlockConversation(conversation); setQuery(""); } catch (error) { window.alert(error instanceof Error ? error.message : "No locked chat matches that secret key."); } }} placeholder={view === "chats" ? "Search chats or enter a secret key" : copy.placeholder} aria-label={copy.placeholder} type="search" />
          </label>
        )}
        {view === 'friends' && (
          <label className="search-field">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.placeholder} aria-label={copy.placeholder} type="search" />
          </label>
        )}
        {view === 'requests' && (
          <label className="search-field">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.placeholder} aria-label={copy.placeholder} type="search" />
          </label>
        )}
        <div className="sidebar-list">
          {['chats', 'groups', 'archived'].includes(view) && renderConversationList()}
          {view === 'friends' && renderFriends()}
          {view === 'requests' && renderRequests()}
          {!['chats', 'groups', 'archived', 'friends', 'requests'].includes(view) && (
            <div className="sidebar-empty">
              <p>{view === 'settings' ? 'Customize your experience in the settings panel.' : view === 'profile' ? 'Manage how others see you.' : view === 'calls' ? 'Your call timeline is shown in the main panel.' : 'You are all caught up.'}</p>
            </div>
          )}
        </div>
      </div>

      <footer className="sidebar-footer" ref={menuRef}>
        <button type="button" className="me-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="menu">
          <Avatar name={me.displayName} pictureKey={me.profilePictureKey} size={38} online />
          <span className="me-copy">
            <strong>{me.displayName}</strong>
            <small>@{me.username}</small>
          </span>
          <Icon name="more" size={18} />
        </button>
        {menuOpen && (
          <div className="profile-menu" role="menu">
            <div className="profile-menu-head">
              <Avatar name={me.displayName} pictureKey={me.profilePictureKey} size={44} />
              <div>
                <strong>{me.displayName}</strong>
                <small>@{me.username}</small>
              </div>
            </div>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onView('profile'); }}>
              <Icon name="user" size={17} /> Profile
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onView('settings'); }}>
              <Icon name="settings" size={17} /> Settings
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNotifications(); }}>
              <Icon name="bell" size={17} /> Notifications <Badge count={unreadNotifications} />
            </button>
            <div className="profile-menu-theme"><ThemeSelector compact /></div>
            <div className="menu-separator" />
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onLogout(); }}>
              <Icon name="logout" size={17} /> Sign out
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => { setMenuOpen(false); onLogoutAll(); }}>
              <Icon name="shield" size={17} /> Sign out everywhere
            </button>
          </div>
        )}
      </footer>
    </aside>
  );
}

export type { Notification };
