'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API, apiFetch, ApiError } from './lib/api';
import type { Conversation, Friend, FriendRequest, Message, Notification, User, View } from './lib/types';
import { AuthProvider, useAuth, useToast } from './providers';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { InfoPanel } from './components/InfoPanel';
import { FriendsView } from './components/FriendsView';
import { RequestsView } from './components/RequestsView';
import { SettingsView } from './components/SettingsView';
import { ProfileView } from './components/ProfileView';
import { GroupsView } from './components/GroupsView';
import { ArchivedView } from './components/ArchivedView';
import { CallHistoryView } from './components/CallHistoryView';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { Icon } from './components/Icon';
import { Avatar, Modal, Spinner } from './components/ui';

type SearchResult = { found: boolean; user: User; relationship: string; request: FriendRequest | null };
type ProfileState = SearchResult & { username?: string };

function ConnectlyApp() {
  const { user, token, loading, logout, logoutAll, clearSession, setUser } = useAuth();
  const toast = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({ incoming: [], outgoing: [] });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [view, setView] = useState<View>('chats');
  const [mobilePane, setMobilePane] = useState<'sidebar' | 'main'>('sidebar');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const [connected, setConnected] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [newChatResult, setNewChatResult] = useState<SearchResult | null>(null);
  const [newChatError, setNewChatError] = useState('');
  const [newChatBusy, setNewChatBusy] = useState(false);
  const [callRequest, setCallRequest] = useState<{ mode: 'audio' | 'video'; callId?: string } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; conversationId: string; callerName: string; callerId?: string; callerAvatarKey?: string | null; callerUsername?: string; mode: 'audio' | 'video'; ringtoneUrl?: string | null; timeoutSeconds?: number } | null>(null);
  const incomingRingtoneRef = useRef<HTMLAudioElement | null>(null);
  const [ringAudioBlocked, setRingAudioBlocked] = useState(false);
  const [callActionBusy, setCallActionBusy] = useState(false);
  const [incomingRemaining, setIncomingRemaining] = useState(30);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBlocked, setProfileBlocked] = useState(false);
  const [profileBlockBusy, setProfileBlockBusy] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const selectedRef = useRef(selectedId);
  const namesRef = useRef(new Map<string, string>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const connectionErrorShown = useRef(false);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (window.location.hash === '#free-ringtone-guide' && user) setView('profile');
  }, [user?.id]);

  useEffect(() => {
    const map = new Map<string, string>();
    if (user) map.set(user.id, user.displayName);
    friends.forEach(({ friend }) => map.set(friend.id, friend.displayName));
    conversations.forEach((conversation) => conversation.members.forEach((member) => map.set(member.user.id, member.user.displayName)));
    namesRef.current = map;
  }, [friends, conversations, user]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('connectly-archived');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setArchivedIds(parsed.filter((value) => typeof value === 'string'));
      }
    } catch {
      // Ignore malformed local archive state.
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch<Conversation[]>('/api/v1/conversations');
      setConversations(data);
    } catch (error) {
      if ((error as ApiError).status !== 401) toast.error(error instanceof Error ? error.message : 'Could not load conversations', 'conversations-error');
    }
  }, [toast]);

  const loadFriends = useCallback(async () => {
    try {
      const data = await apiFetch<Friend[]>('/api/v1/friends');
      setFriends(data);
      setOnlineUsers((current) => {
        const next = new Set(current);
        data.forEach(({ friend }) => {
          if (friend.online) next.add(friend.id);
        });
        return next;
      });
    } catch (error) {
      if ((error as ApiError).status !== 401) toast.error(error instanceof Error ? error.message : 'Could not load friends', 'friends-error');
    }
  }, [toast]);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await apiFetch<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/api/v1/friend-requests'));
    } catch (error) {
      if ((error as ApiError).status !== 401) toast.error(error instanceof Error ? error.message : 'Could not load friend requests', 'requests-error');
    }
  }, [toast]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: Notification[]; unreadCount: number }>('/api/v1/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      if ((error as ApiError).status !== 401) toast.error(error instanceof Error ? error.message : 'Could not load notifications', 'notifications-error');
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    loadFriends();
    loadRequests();
    loadNotifications();
  }, [user?.id, loadConversations, loadFriends, loadRequests, loadNotifications]);

  useEffect(() => {
    if (!user || !token) return;
    const socket = io(API, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      connectionErrorShown.current = false;
      if (selectedRef.current) socket.emit('conversation:join', selectedRef.current);
    });
    socket.on('disconnect', () => {
      setConnected(false);
      if (!connectionErrorShown.current) {
        connectionErrorShown.current = true;
        toast.warning('Connection interrupted. Trying to reconnect…', 'connection-interrupted', 'Connection interrupted');
      }
    });
    socket.on('connect_error', () => {
      setConnected(false);
      if (!connectionErrorShown.current) {
        connectionErrorShown.current = true;
        toast.warning('Live connection unavailable. Messages may be delayed.', 'connection-error', 'Connection problem');
      }
    });

    socket.on('message:new', (message: Message) => {
      setConversations((current) => {
        const next = current.map((conversation) =>
          conversation.id === message.conversationId ? { ...conversation, messages: [message], updatedAt: message.createdAt } : conversation,
        );
        const index = next.findIndex((conversation) => conversation.id === message.conversationId);
        if (index > 0) {
          const [conversation] = next.splice(index, 1);
          next.unshift(conversation);
        }
        return next;
      });
      if (message.conversationId === selectedRef.current) {
        setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
        if (message.senderId !== user.id) {
          socket.emit('message:delivered', { messageIds: [message.id], conversationId: message.conversationId });
          socket.emit('message:read', { messageIds: [message.id], conversationId: message.conversationId });
        }
      }
    });
    socket.on('message:deleted', ({ messageId, deletedAt }: { messageId: string; deletedAt: string }) => { setMessages((current) => current.map((message) => message.id === messageId ? { ...message, body: null, attachment: null, deletedAt } : message)); });
    socket.on('call:incoming', async (call: { callId: string; conversationId: string; callerName: string; callerId?: string; callerAvatarKey?: string | null; callerUsername?: string; mode: 'audio' | 'video'; ringtoneUrl?: string | null; timeoutSeconds?: number }) => {
      setIncomingCall((current) => current?.callId === call.callId ? current : call);
      setCallActionBusy(false);
      incomingRingtoneRef.current?.pause();
      const ringtone = new Audio(call.ringtoneUrl || '/sounds/default-ring.wav');
      ringtone.loop = true; ringtone.volume = 0.9; incomingRingtoneRef.current = ringtone;
      try { await ringtone.play(); setRingAudioBlocked(false); } catch { setRingAudioBlocked(true); }
    });
    socket.on('call:status', (call: { callId?: string; status: string }) => {
      if (call.status === 'CONNECTED') { incomingRingtoneRef.current?.pause(); if (incomingRingtoneRef.current) incomingRingtoneRef.current.currentTime = 0; setIncomingCall((current) => current?.callId === call.callId ? null : current); }
      if (call.status === 'REJECTED') toast.info('Call rejected.', 'call-rejected-status');
    });
    socket.on('call:ended', (call: { callId?: string; status: string }) => {
      if (call.callId) setIncomingCall((current) => current?.callId === call.callId ? null : current);
      incomingRingtoneRef.current?.pause(); if (incomingRingtoneRef.current) incomingRingtoneRef.current.currentTime = 0;
      if (call.status === 'NO_RESPONSE') toast.info('Call ended: no response.', 'call-no-response');
    });
    socket.on('message:error', () => toast.error('Message could not be sent. Please try again.', 'message-error'));
    socket.on('receipt:delivered', ({ messageIds, userId, deliveredAt }: { messageIds: string[]; userId: string; deliveredAt: string }) => {
      setMessages((current) => current.map((message) => messageIds.includes(message.id) ? {
        ...message,
        receipts: [...(message.receipts || []).filter((receipt) => receipt.userId !== userId), { userId, deliveredAt }],
      } : message));
    });
    socket.on('receipt:read', ({ messageId, messageIds, userId, readAt }: { messageId?: string; messageIds?: string[]; userId: string; readAt?: string }) => {
      const ids = new Set(messageIds || (messageId ? [messageId] : []));
      setMessages((current) =>
        current.map((message) =>
          ids.has(message.id)
            ? {
                ...message,
                receipts: [
                  ...(message.receipts || []).filter((receipt) => receipt.userId !== userId),
                  { userId, readAt: readAt || new Date().toISOString() },
                ],
              }
            : message,
        ),
      );
    });
    socket.on('typing', ({ userId, conversationId, typing: isTyping }: { userId: string; conversationId: string; typing: boolean }) => {
      const key = `${conversationId}:${userId}`;
      const existing = typingTimers.current.get(key);
      if (existing) clearTimeout(existing);
      const name = namesRef.current.get(userId) || 'Someone';
      setTyping((current) => {
        const list = current[conversationId] || [];
        if (!isTyping) return { ...current, [conversationId]: list.filter((item) => item !== name) };
        return { ...current, [conversationId]: list.includes(name) ? list : [...list, name] };
      });
      if (isTyping) {
        typingTimers.current.set(
          key,
          setTimeout(() => {
            setTyping((current) => ({
              ...current,
              [conversationId]: (current[conversationId] || []).filter((item) => item !== name),
            }));
            typingTimers.current.delete(key);
          }, 4000),
        );
      }
    });
    socket.on('presence:update', ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
    socket.on('friend-request:new', () => loadRequests());
    socket.on('friend-request:updated', () => loadRequests());
    socket.on('friends:updated', () => {
      loadFriends();
      loadConversations();
    });
    socket.on('conversation:updated', () => loadConversations());
    socket.on('notification:new', (notification: Notification) => {
      const data = notification.data as { conversationId?: string } | null;
      const alreadyViewing = notification.type === 'NEW_MESSAGE' && data?.conversationId === selectedRef.current;
      const nextNotification = alreadyViewing ? { ...notification, readAt: new Date().toISOString() } : notification;
      setNotifications((current) => (current.some((item) => item.id === notification.id) ? current : [nextNotification, ...current].slice(0, 100)));
      if (!alreadyViewing) setUnreadCount((current) => current + 1);
      else if (data?.conversationId) void apiFetch(`/api/v1/conversations/${data.conversationId}/read`, { method: 'POST' }).catch(() => undefined);
      if (notification.type === 'FRIEND_REQUEST') toast.info(notification.body || notification.title, `notification-${notification.id}`, notification.title);
      else if (notification.type === 'FRIEND_REQUEST_ACCEPTED') toast.success(notification.body || notification.title, `notification-${notification.id}`, notification.title);
      else if (notification.type === 'FRIEND_REQUEST_CANCELLED') toast.info(notification.body || notification.title, `notification-${notification.id}`, notification.title);
      else if (notification.type === 'NEW_MESSAGE' && !alreadyViewing) toast.info(notification.body || notification.title, `notification-${notification.id}`, notification.title);
    });
    socket.on('session:revoked', () => {
      toast.warning('Your session was ended. Please sign in again.', 'session-ended', 'Signed out');
      clearSession();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, token, toast, loadRequests, loadFriends, loadConversations, clearSession]);

  useEffect(() => {
    return () => {
      typingTimers.current.forEach((timer) => clearTimeout(timer));
      typingTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!selectedId || !user) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    setMessageError('');
    apiFetch<Message[]>(`/api/v1/conversations/${selectedId}/messages`)
      .then((data) => {
        if (active) {
          setMessages([...data].reverse());
          const incomingIds = data.filter((message) => message.senderId !== user.id).map((message) => message.id);
          if (incomingIds.length) {
            socketRef.current?.emit('message:delivered', { messageIds: incomingIds, conversationId: selectedId });
            socketRef.current?.emit('message:read', { messageIds: incomingIds, conversationId: selectedId });
          }
        }
      })
      .catch((error) => {
        if (active) setMessageError(error instanceof Error ? error.message : 'Could not load messages');
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    socketRef.current?.emit('conversation:join', selectedId);
    return () => {
      active = false;
    };
  }, [selectedId, user?.id]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId],
  );
  const groups = useMemo(() => conversations.filter((conversation) => conversation.type === 'GROUP'), [conversations]);
  const archived = useMemo(() => conversations.filter((conversation) => archivedIds.includes(conversation.id)), [conversations, archivedIds]);
  const unreadByConversation = useMemo(() => {
    const result: Record<string, number> = {};
    notifications.forEach((notification) => {
      if (notification.readAt || notification.type !== 'NEW_MESSAGE') return;
      const data = notification.data as { conversationId?: string } | null;
      if (data?.conversationId) result[data.conversationId] = (result[data.conversationId] || 0) + 1;
    });
    return result;
  }, [notifications]);
  const unreadTotal = useMemo(() => Object.values(unreadByConversation).reduce((sum, value) => sum + value, 0), [unreadByConversation]);

  async function respondToIncomingCall(action: 'ACCEPT' | 'REJECT') {
    if (!incomingCall || callActionBusy) return;
    setCallActionBusy(true);
    const call = incomingCall;
    incomingRingtoneRef.current?.pause();
    if (incomingRingtoneRef.current) incomingRingtoneRef.current.currentTime = 0;
    try {
      await apiFetch(`/api/v1/calls/${call.callId}/respond`, { method: 'POST', body: { action } });
      setIncomingCall(null);
      if (action === 'ACCEPT') {
        setSelectedId(call.conversationId); setView('chats'); setMobilePane('main');
        setCallRequest({ mode: call.mode, callId: call.callId }); void loadConversations();
      } else toast.info(`Call from ${call.callerName} declined.`, 'call-declined');
    } catch (error) {
      setIncomingCall(null);
      toast.error(error instanceof Error ? error.message : 'This call is no longer available.', 'call-respond-error');
    } finally { setCallActionBusy(false); }
  }

  useEffect(() => () => { incomingRingtoneRef.current?.pause(); incomingRingtoneRef.current = null; }, []);

  useEffect(() => {
    if (!incomingCall) return;
    const expiresAt = Date.now() + (incomingCall.timeoutSeconds || 30) * 1000;
    const update = () => setIncomingRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [incomingCall?.callId]);

  function navigate(next: View) {
    setView(next);
    setMobilePane('main');
    if (next !== 'chats') setInfoOpen(false);
  }

  function openConversation(id: string) {
    setSelectedId(id);
    setView('chats');
    setMobilePane('main');
    setInfoOpen(false);
    // Clear unread indicators as soon as this conversation is opened.
    setNotifications((current) => current.map((item) => {
      const data = item.data as { conversationId?: string } | null;
      return item.type === 'NEW_MESSAGE' && data?.conversationId === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item;
    }));
    void apiFetch(`/api/v1/conversations/${id}/read`, { method: 'POST' }).then(() => loadNotifications()).catch(() => undefined);
  }

  async function sendMessage(body: string, attachmentId?: string, replyToMessageId?: string) {
    if (!selectedId) return;
    const socket = socketRef.current;
    if (!socket) {
      toast.error('Not connected to the message service.', 'not-connected');
      return;
    }
    const clientMessageId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    socket.emit('message:send', { conversationId: selectedId, body, type: 'TEXT', attachmentId, replyToId: replyToMessageId, clientMessageId });
    socket.emit('typing', { conversationId: selectedId, typing: false });
  }

  function handleDraftActivity() {
    if (!selectedId) return;
    socketRef.current?.emit('typing', { conversationId: selectedId, typing: true });
  }

  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => socketRef.current?.emit('typing', { conversationId: selectedId, typing: false }), 1800);
    return () => clearTimeout(timer);
  }, [messages.length, selectedId]);

  function toggleArchive(id: string) {
    const next = archivedIds.includes(id) ? archivedIds.filter((value) => value !== id) : [...archivedIds, id];
    setArchivedIds(next);
    try {
      window.localStorage.setItem('connectly-archived', JSON.stringify(next));
    } catch {
      // Archive state is a client convenience; ignore storage failures.
    }
    toast.success(archivedIds.includes(id) ? 'Conversation unarchived.' : 'Conversation archived.', `archive-${id}`);
  }

  async function startConversation(username: string) {
    try {
      const conversation = await apiFetch<Conversation>('/api/v1/conversations/direct', { method: 'POST', body: { username } });
      const normalized = { ...conversation, messages: conversation.messages || [] };
      setConversations((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)]);
      openConversation(normalized.id);
      toast.success(`Conversation ready with @${username}.`, `conversation-${username}`);
    } catch (error) {
      if ((error as ApiError).code === 'NOT_FRIENDS') {
        toast.info(`You need to be friends with @${username} before messaging.`, 'not-friends', 'Friend request required');
      } else {
        toast.error(error instanceof Error ? error.message : 'Could not start conversation', 'conversation-error');
      }
      throw error;
    }
  }

  async function searchNewChat(event: React.FormEvent) {
    event.preventDefault();
    const term = newChatQuery.trim();
    if (!term) return;
    setNewChatBusy(true);
    setNewChatError('');
    setNewChatResult(null);
    try {
      const result = await apiFetch<SearchResult>(`/api/v1/users/search?q=${encodeURIComponent(term)}`);
      setNewChatResult(result);
    } catch (error) {
      setNewChatError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setNewChatBusy(false);
    }
  }

  async function sendRequestFromModal(username: string) {
    setNewChatBusy(true);
    try {
      await apiFetch('/api/v1/friend-requests', { method: 'POST', body: { username } });
      toast.success(`Friend request sent to @${username}.`, `request-sent-${username}`, 'Request sent');
      setNewChatResult((current) => (current ? { ...current, relationship: 'SENT' } : current));
      loadRequests();
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === 'OPPOSITE_PENDING') {
        toast.info(`@${username} already sent you a request. Accept it from Friend Requests.`, 'opposite-pending', 'Request waiting');
        loadRequests();
        setNewChatOpen(false);
        navigate('requests');
      } else {
        toast.error(apiError.message, 'request-send-error');
      }
    } finally {
      setNewChatBusy(false);
    }
  }

  async function createGroup(event: React.FormEvent) {
    event.preventDefault();
    const usernames = groupMembers
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!groupTitle.trim() || !usernames.length) {
      toast.warning('Add a group title and at least one member username.', 'group-validation');
      return;
    }
    setGroupBusy(true);
    try {
      const conversation = await apiFetch<Conversation>('/api/v1/conversations/group', {
        method: 'POST',
        body: { title: groupTitle.trim(), usernames },
      });
      await loadConversations();
      setGroupOpen(false);
      setGroupTitle('');
      setGroupMembers('');
      toast.success('Group created successfully.', 'group-created', 'Group created');
      openConversation(conversation.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create group', 'group-error');
    } finally {
      setGroupBusy(false);
    }
  }

  async function viewProfile(username: string) {
    setProfileLoading(true);
    setProfileBlocked(false);
    setProfile(null);
    try {
      const result = await apiFetch<SearchResult>(`/api/v1/users/search?q=${encodeURIComponent(username)}`);
      setProfile({ ...result, username });
      const blocked = await apiFetch<{ user: User }[]>('/api/v1/users/blocked').catch(() => []);
      setProfileBlocked(blocked.some((row) => row.user.id === result.user.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load profile', 'profile-load-error');
    } finally {
      setProfileLoading(false);
    }
  }

  async function markNotificationRead(notification: Notification) {
    if (!notification.readAt) {
      try {
        await apiFetch(`/api/v1/notifications/${notification.id}/read`, { method: 'PATCH' });
        setNotifications((current) => current.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        // Reading a notification is best-effort; still navigate.
      }
    }
    if (notification.type === 'FRIEND_REQUEST') {
      setDrawerOpen(false);
      navigate('requests');
    } else if (notification.type === 'FRIEND_REQUEST_ACCEPTED') {
      setDrawerOpen(false);
      navigate('friends');
    } else if (notification.type === 'NEW_MESSAGE') {
      const data = notification.data as { conversationId?: string } | null;
      if (data?.conversationId) {
        setDrawerOpen(false);
        openConversation(data.conversationId);
      }
    }
  }

  async function markAllRead() {
    try {
      await apiFetch('/api/v1/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt || now })));
      setUnreadCount(0);
      toast.success('All notifications marked as read.', 'notifications-read', 'Notifications');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update notifications', 'notifications-read-error');
    }
  }

  async function handleLogout() {
    await logout();
    toast.info('You have been signed out.', 'signed-out');
    setMobilePane('sidebar');
    setSelectedId('');
  }

  async function handleLogoutAll() {
    await logoutAll();
    toast.success('Signed out of all devices.', 'signed-out-all');
    setMobilePane('sidebar');
    setSelectedId('');
  }

  async function toggleProfileBlock() {
    if (!profile) return;
    const username = profile.user.username;
    setProfileBlockBusy(true);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(username)}/block`, { method: profileBlocked ? 'DELETE' : 'POST' });
      setProfileBlocked(!profileBlocked);
      toast.success(profileBlocked ? `@${username} has been unblocked.` : `@${username} has been blocked.`, `profile-block-${username}`);
      await Promise.all([loadConversations(), loadFriends()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update block status'); }
    finally { setProfileBlockBusy(false); }
  }

  async function blockFromInfo(username: string, currentlyBlocked: boolean) {
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(username)}/block`, { method: currentlyBlocked ? 'DELETE' : 'POST' });
      toast.success(currentlyBlocked ? `@${username} has been unblocked.` : `@${username} has been blocked.`, `${currentlyBlocked ? 'unblocked' : 'blocked'}-${username}`, currentlyBlocked ? 'User unblocked' : 'User blocked');
      await Promise.all([loadConversations(), loadFriends()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${currentlyBlocked ? 'unblock' : 'block'} user`, 'block-error');
      throw error;
    }
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="brand brand-lg">
          connectly<span>.</span>
        </div>
        <Spinner label="Restoring your session" />
        <p>Restoring your session…</p>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  const me: User = user;

  return (
    <main className={`app-shell ${mobilePane === 'main' ? 'mobile-main' : ''}`}>
      <Sidebar
        view={view}
        onView={navigate}
        me={me}
        conversations={conversations}
        friends={friends}
        requests={requests}
        archived={archived}
        selectedId={selectedId}
        unreadNotifications={unreadCount}
        unreadByConversation={unreadByConversation}
        unreadTotal={unreadTotal}
        onlineUsers={onlineUsers}
        onSelectConversation={openConversation}
        onNewChat={() => {
          setNewChatOpen(true);
          setNewChatQuery('');
          setNewChatResult(null);
          setNewChatError('');
        }}
        onNotifications={() => setDrawerOpen(true)}
        onLogout={handleLogout}
        onLogoutAll={handleLogoutAll}
        onUnlockConversation={(conversation) => {
          setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
          setView('chats'); setMobilePane('main'); openConversation(conversation.id);
        }}
      />

      <div className="main-area">
        {view === 'chats' && (
          <div className={`chat-layout ${infoOpen ? 'info-open' : ''}`}>
            <ChatView
              conversation={selectedConversation}
              me={me}
              messages={messages}
              loading={loadingMessages}
              error={messageError}
              typingUsers={selectedId ? typing[selectedId] || [] : []}
              onlineUsers={onlineUsers}
              infoOpen={infoOpen}
              archived={selectedId ? archivedIds.includes(selectedId) : false}
              connected={connected}
              onSend={(body, attachmentId, replyToMessageId) => {
                handleDraftActivity();
                sendMessage(body, attachmentId, replyToMessageId);
              }}
              onTyping={handleDraftActivity}
              onRetry={() => {
                if (!selectedId) return;
                setLoadingMessages(true);
                setMessageError('');
                apiFetch<Message[]>(`/api/v1/conversations/${selectedId}/messages`)
                  .then((data) => setMessages([...data].reverse()))
                  .catch((error) => setMessageError(error instanceof Error ? error.message : 'Could not load messages'))
                  .finally(() => setLoadingMessages(false));
              }}
              onBack={() => setMobilePane('sidebar')}
              onToggleInfo={() => setInfoOpen((open) => !open)}
              onToggleArchive={() => selectedId && toggleArchive(selectedId)}
              callRequest={callRequest}
              onCallRequestHandled={() => setCallRequest(null)}
            />
            {infoOpen && selectedConversation && (
              <InfoPanel
                conversation={selectedConversation}
                me={me}
                onlineUsers={onlineUsers}
                onClose={() => setInfoOpen(false)}
                onViewProfile={viewProfile}
                onBlock={blockFromInfo}
              />
            )}
          </div>
        )}

        {view === 'dashboard' && (
          <section className="content-view connectly-dashboard"><header className="view-head"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1><p className="muted">Your Connectly activity at a glance.</p></div></header><div className="dashboard-stat-grid"><article className="dashboard-stat"><span>Conversations</span><strong>{conversations.length}</strong></article><article className="dashboard-stat"><span>Friends</span><strong>{friends.length}</strong></article><article className="dashboard-stat"><span>Pending requests</span><strong>{requests.incoming.filter((request) => request.status === 'PENDING').length}</strong></article><article className="dashboard-stat"><span>Unread messages</span><strong>{unreadTotal}</strong></article></div><div className="dashboard-shortcuts"><button className="button primary" onClick={() => navigate('chats')}>Open chats</button><button className="button secondary" onClick={() => navigate('friends')}>View friends</button><button className="button secondary" onClick={() => navigate('calls')}>Call history</button></div></section>
        )}

        {view === 'friends' && (
          <FriendsView
            friends={friends}
            onlineUsers={onlineUsers}
            onRefresh={async () => {
              await Promise.all([loadFriends(), loadRequests()]);
            }}
            onStartChat={async (username) => {
              try {
                await startConversation(username);
              } catch {
                // startConversation already surfaced the error.
              }
            }}
            onViewProfile={viewProfile}
            onGoRequests={() => navigate('requests')}
          />
        )}

        {view === 'requests' && (
          <RequestsView
            requests={requests}
            onRefresh={async () => {
              await Promise.all([loadRequests(), loadFriends(), loadConversations()]);
            }}
            onViewProfile={viewProfile}
            onFindFriends={() => navigate('friends')}
          />
        )}

        {view === 'groups' && (
          <GroupsView groups={groups} me={me} onOpen={openConversation} onCreate={() => setGroupOpen(true)} />
        )}

        {view === 'archived' && <ArchivedView conversations={archived} me={me} onOpen={openConversation} onUnarchive={toggleArchive} />}

        {view === 'calls' && <CallHistoryView conversations={conversations} me={me} />}

        {view === 'settings' && <SettingsView />}

        {view === 'profile' && <ProfileView me={me} />}

        {view === 'notifications' && (
          <div className="content-view">
            <header className="view-head">
              <div><p className="eyebrow">Inbox</p><h1>Notifications</h1><p className="muted">Your account updates, friend activity and moderation notices appear here.</p></div>
              <button type="button" className="button secondary" onClick={() => void markAllRead()} disabled={!unreadCount}>Mark all as read</button>
            </header>
            <section className="panel notification-page-panel">
              {!notifications.length ? <div className="panel-message">You are all caught up.</div> : <div className="notification-page-list">{notifications.map((notification) => (
                <button type="button" key={notification.id} className={`notification-page-item ${notification.readAt ? '' : 'unread'}`} onClick={() => void markNotificationRead(notification)}>
                  <span className={`notification-page-icon type-${notification.type.toLowerCase()}`}><Icon name={notification.type === 'FRIEND_REQUEST' ? 'userPlus' : notification.type === 'NEW_MESSAGE' ? 'chat' : 'bell'} size={18}/></span>
                  <span className="notification-page-copy"><strong>{notification.title}</strong>{notification.body && <span>{notification.body}</span>}<small>{new Date(notification.createdAt).toLocaleString()}</small></span>
                  {!notification.readAt && <span className="unread-dot" aria-label="Unread"/>}
                </button>
              ))}</div>}
            </section>
          </div>
        )}

        <nav className="mobile-tabbar" aria-label="Mobile navigation">
          <button type="button" className={view === 'chats' ? 'active' : ''} onClick={() => navigate('chats')}>
            <Icon name="chat" size={20} /> <span>Chats</span>
          </button>
          <button type="button" className={view === 'friends' ? 'active' : ''} onClick={() => navigate('friends')}>
            <Icon name="users" size={20} /> <span>Friends</span>
          </button>
          <button type="button" className={view === 'requests' ? 'active' : ''} onClick={() => navigate('requests')}>
            <Icon name="userPlus" size={20} /> <span>Requests</span>
          </button>
          <button type="button" className={view === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>
            <Icon name="settings" size={20} /> <span>Settings</span>
          </button>
          <button type="button" onClick={() => setMobilePane('sidebar')}>
            <Icon name="more" size={20} /> <span>Menu</span>
          </button>
        </nav>
      </div>

      <NotificationsDrawer
        open={drawerOpen}
        notifications={notifications}
        unreadCount={unreadCount}
        onClose={() => setDrawerOpen(false)}
        onMarkAll={markAllRead}
        onSelect={markNotificationRead}
      />

      <Modal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        title="New conversation"
        footer={
          <button type="button" className="button ghost" onClick={() => setNewChatOpen(false)}>
            Close
          </button>
        }
      >
        <form className="modal-search" onSubmit={searchNewChat}>
          <label className="search-field grow">
            <Icon name="search" size={16} />
            <input type="text" autoComplete="off" spellCheck={false} value={newChatQuery} onChange={(event) => { setNewChatQuery(event.target.value); setNewChatError(''); }} placeholder="Exact username" aria-label="Search exact username" />
          </label>
          <button type="submit" className="button primary" disabled={newChatBusy || !newChatQuery.trim()}>
            Search
          </button>
        </form>
        {newChatBusy && <div className="panel-loading"><Spinner /> Searching…</div>}
        {newChatError && <p className="panel-message error">{newChatError}</p>}
        {newChatResult && (
          <div className="modal-person">
            <Avatar name={newChatResult.user.displayName} pictureKey={newChatResult.user.profilePictureKey} size={50} />
            <div className="person-copy">
              <strong>{newChatResult.user.displayName}</strong>
              <small>@{newChatResult.user.username}</small>
              <span className={`relationship relationship-${newChatResult.relationship.toLowerCase()}`}>{newChatResult.relationship.toLowerCase()}</span>
            </div>
            <div className="person-actions">
              {newChatResult.relationship === 'ACCEPTED' && (
                <button
                  type="button"
                  className="button primary small"
                  onClick={async () => {
                    setNewChatOpen(false);
                    try {
                      await startConversation(newChatResult.user.username);
                    } catch {
                      // Error already surfaced.
                    }
                  }}
                >
                  Message
                </button>
              )}
              {(newChatResult.relationship === 'NONE' || newChatResult.relationship === 'REJECTED' || newChatResult.relationship === 'CANCELLED') && (
                <button type="button" className="button primary small" disabled={newChatBusy} onClick={() => sendRequestFromModal(newChatResult.user.username)}>
                  Send friend request
                </button>
              )}
              {newChatResult.relationship === 'RECEIVED' && (
                <button type="button" className="button secondary small" onClick={() => { setNewChatOpen(false); navigate('requests'); }}>
                  Respond to request
                </button>
              )}
              {newChatResult.relationship === 'SENT' && <span className="muted">Request already sent</span>}
            </div>
          </div>
        )}
        {!newChatResult && !newChatBusy && !newChatError && (
          <p className="panel-help">Search by exact, case-sensitive username. You can message people who are already your friends, or send them a friend request first.</p>
        )}
      </Modal>

      <Modal
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        title="Create a group"
        footer={
          <>
            <button type="button" className="button ghost" onClick={() => setGroupOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="group-form" className="button primary" disabled={groupBusy}>
              {groupBusy ? 'Creating…' : 'Create group'}
            </button>
          </>
        }
      >
        <form id="group-form" className="stack-form" onSubmit={createGroup}>
          <label className="field">
            <span>Group name</span>
            <input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} placeholder="Design team" maxLength={100} required />
          </label>
          <label className="field">
            <span>Member usernames</span>
            <textarea value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} rows={3} placeholder="alex, sam, taylor" />
            <small className="field-hint">Separate exact usernames with commas. You are added automatically.</small>
          </label>
        </form>
      </Modal>

      <Modal open={Boolean(profile) || profileLoading} onClose={() => setProfile(null)} title="Profile" size="sm">
        {profileLoading && <div className="panel-loading"><Spinner /> Loading profile…</div>}
        {profile && (
          <div className="profile-modal">
            <Avatar name={profile.user.displayName} pictureKey={profile.user.profilePictureKey} size={76} />
            <h2>{profile.user.displayName}</h2>
            <span className="muted">@{profile.user.username}</span>
            <span className={`relationship relationship-${profile.relationship.toLowerCase()}`}>{profile.relationship.toLowerCase()}</span>
            <p>{profile.user.about || 'No about text yet.'}</p>
            <div className="person-actions">
              {profile.relationship === 'ACCEPTED' && (
                <button
                  type="button"
                  className="button primary"
                  onClick={async () => {
                    setProfile(null);
                    try {
                      await startConversation(profile.user.username);
                    } catch {
                      // Error already surfaced.
                    }
                  }}
                >
                  <Icon name="message" size={15} /> Message
                </button>
              )}
              {(profile.relationship === 'NONE' || profile.relationship === 'REJECTED' || profile.relationship === 'CANCELLED') && (
                <button
                  type="button"
                  className="button primary"
                  onClick={async () => {
                    try {
                      await apiFetch('/api/v1/friend-requests', { method: 'POST', body: { username: profile.user.username } });
                      toast.success(`Friend request sent to @${profile.user.username}.`, `request-sent-${profile.user.username}`, 'Request sent');
                      setProfile({ ...profile, relationship: 'SENT' });
                      loadRequests();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not send request', 'request-send-error');
                    }
                  }}
                >
                  Add friend
                </button>
              )}
              {profile.relationship === 'RECEIVED' && (
                <button
                  type="button"
                  className="button primary"
                  onClick={async () => {
                    if (!profile.request) return;
                    try {
                      await apiFetch(`/api/v1/friend-requests/${profile.request.id}/accept`, { method: 'POST' });
                      toast.success(`You are now friends with @${profile.user.username}.`, `friend-accepted-${profile.request.id}`, 'Friend added');
                      setProfile({ ...profile, relationship: 'ACCEPTED', request: null });
                      await Promise.all([loadFriends(), loadRequests()]);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Could not accept request', 'accept-error');
                    }
                  }}
                >
                  Accept request
                </button>
              )}
              {profile.user.id !== me.id && <>
                <button type="button" className={`button ${profileBlocked ? 'secondary' : 'danger-ghost'}`} disabled={profileBlockBusy} onClick={() => void toggleProfileBlock()}>
                  <Icon name="shield" size={15} /> {profileBlockBusy ? 'Please wait…' : profileBlocked ? 'Unblock user' : 'Block user'}
                </button>
                <button type="button" className="button danger-ghost" onClick={() => { const target = profile.user.username; setProfile(null); window.location.assign(`/report/${encodeURIComponent(target)}`); }}>
                  <Icon name="flag" size={15} /> Report user
                </button>
              </>}
              <button type="button" className="button ghost" onClick={() => setProfile(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
      {incomingCall && <div className="incoming-call-backdrop" role="dialog" aria-modal="true" aria-label="Incoming call">
        <section className="incoming-call-card">
          <div className="incoming-call-ripple"><Avatar name={incomingCall.callerName} pictureKey={incomingCall.callerAvatarKey} size={104} /></div>
          <p className="incoming-call-eyebrow">CONNECTLY · INCOMING {incomingCall.mode.toUpperCase()} CALL</p>
          <h2>{incomingCall.callerName}</h2>
          <p className="incoming-call-status">Calling you… · {incomingRemaining}s</p>
          {incomingCall.callerUsername && <p className="incoming-call-username">@{incomingCall.callerUsername}</p>}
          {ringAudioBlocked && <button className="button ghost" onClick={() => { void incomingRingtoneRef.current?.play().then(() => setRingAudioBlocked(false)).catch(() => setRingAudioBlocked(true)); }}>Enable ringtone</button>}
          <div className="incoming-call-actions">
            <button className="incoming-call-decline" disabled={callActionBusy} onClick={() => void respondToIncomingCall('REJECT')} aria-label="Decline call"><Icon name="phone" /> <span>Decline</span></button>
            <button className="incoming-call-accept" disabled={callActionBusy} onClick={() => void respondToIncomingCall('ACCEPT')} aria-label="Accept call"><Icon name={incomingCall.mode === 'video' ? 'video' : 'phone'} /> <span>Accept</span></button>
          </div>
        </section>
      </div>}
    </main>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <ConnectlyApp />
    </AuthProvider>
  );
}
