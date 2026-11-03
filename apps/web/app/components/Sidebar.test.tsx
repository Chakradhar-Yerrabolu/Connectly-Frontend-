import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../providers';
import type { Conversation, FriendRequest } from '../lib/types';
import { Sidebar } from './Sidebar';

const me = { id: 'me', username: 'alex', displayName: 'Alex Rivera' };
const incoming: FriendRequest = {
  id: 'request-1',
  senderId: 'sam',
  receiverId: 'me',
  status: 'PENDING',
  createdAt: '2026-10-30T08:00:00.000Z',
  sender: { id: 'sam', username: 'sam', displayName: 'Sam Lee' },
  receiver: me,
};

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props: React.ComponentProps<typeof Sidebar> = {
    view: 'chats',
    onView: vi.fn(),
    me,
    conversations: [],
    friends: [],
    requests: { incoming: [], outgoing: [] },
    archived: [],
    selectedId: '',
    unreadNotifications: 0,
    unreadByConversation: {},
    unreadTotal: 0,
    onlineUsers: new Set<string>(),
    onSelectConversation: vi.fn(),
    onNewChat: vi.fn(),
    onNotifications: vi.fn(),
    onLogout: vi.fn(),
    onLogoutAll: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider>
      <Sidebar {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe('Sidebar', () => {
  it('navigates between primary sections and exposes unread counts', async () => {
    const user = userEvent.setup();
    const props = renderSidebar({ requests: { incoming: [incoming], outgoing: [] }, unreadNotifications: 3, unreadTotal: 2 });

    expect(screen.getByRole('button', { name: 'Notifications (3 unread)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start a conversation/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^friends$/i }));
    expect(props.onView).toHaveBeenCalledWith('friends');

    await user.click(screen.getByRole('button', { name: /^friend requests/i }));
    expect(props.onView).toHaveBeenCalledWith('requests');
  });

  it('opens the account menu for profile, settings, theme and logout actions', async () => {
    const user = userEvent.setup();
    const props = renderSidebar();

    await user.click(screen.getByRole('button', { name: /Alex Rivera/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(within(menu).getByRole('radio', { name: /github/i })).toBeInTheDocument();

    await user.click(within(menu).getByRole('menuitem', { name: /settings/i }));
    expect(props.onView).toHaveBeenCalledWith('settings');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('filters conversation previews and opens the selected chat', async () => {
    const user = userEvent.setup();
    const conversation: Conversation = {
      id: 'conversation-1',
      type: 'DIRECT',
      title: null,
      updatedAt: '2026-10-30T08:00:00.000Z',
      members: [
        { role: 'MEMBER', user: me },
        { role: 'MEMBER', user: { id: 'sam', username: 'sam', displayName: 'Sam Lee' } },
      ],
      messages: [{ id: 'message-1', conversationId: 'conversation-1', senderId: 'sam', body: 'See you at 3', type: 'TEXT', createdAt: '2026-10-30T08:00:00.000Z' }],
    };
    const props = renderSidebar({ conversations: [conversation] });

    expect(screen.getByText('See you at 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Sam Lee/ }));
    expect(props.onSelectConversation).toHaveBeenCalledWith('conversation-1');

    await user.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'zzz');
    expect(screen.queryByRole('button', { name: /Sam Lee/ })).not.toBeInTheDocument();
    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
  });
});
