export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  about?: string | null;
  profilePictureKey?: string | null;
  gender?: string;
  online?: boolean;
  lastSeenAt?: string | null;
  showLastSeen?: boolean;
  ringtoneUrl?: string | null;
  callerTuneUrl?: string | null;
};

export type MessageAttachment = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number | null;
  createdAt?: string;
};

export type MessageReceipt = { userId: string; deliveredAt?: string | null; readAt?: string | null };

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body?: string | null;
  type: string;
  createdAt: string;
  clientMessageId?: string | null;
  sender?: User;
  receipts?: MessageReceipt[];
  attachment?: MessageAttachment | null;
  pending?: boolean;
  failed?: boolean;
  deletedAt?: string | null;
  replyToId?: string | null;
  replyTo?: Message | null;
};

export type Conversation = {
  id: string;
  title?: string | null;
  type: 'DIRECT' | 'GROUP' | string;
  members: { user: User; role?: string; isFavorite?: boolean; isLocked?: boolean }[];
  messages: Message[];
  updatedAt?: string;
};

export type Friend = { friendshipId: string; friend: User; online: boolean; since: string };

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export type FriendRequest = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt?: string;
  sender: User;
  receiver: User;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
};

export type View = 'dashboard' | 'chats' | 'friends' | 'requests' | 'groups' | 'archived' | 'calls' | 'settings' | 'profile' | 'notifications';
