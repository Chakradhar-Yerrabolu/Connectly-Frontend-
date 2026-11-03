import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FriendRequestCard } from './RequestsView';
import type { FriendRequest } from '../lib/types';

const sender = { id: 'u1', username: 'alex', displayName: 'Alex Rivera' };
const receiver = { id: 'u2', username: 'sam', displayName: 'Sam Lee' };

function request(overrides: Partial<FriendRequest> = {}): FriendRequest {
  return {
    id: 'request-1',
    senderId: sender.id,
    receiverId: receiver.id,
    status: 'PENDING',
    createdAt: '2026-10-30T08:00:00.000Z',
    sender,
    receiver,
    ...overrides,
  };
}

function actions() {
  return { onAccept: vi.fn(), onReject: vi.fn(), onCancel: vi.fn(), onViewProfile: vi.fn() };
}

describe('FriendRequestCard', () => {
  it('renders incoming pending requests with identity and working actions', async () => {
    const user = userEvent.setup();
    const handlers = actions();
    render(<FriendRequestCard request={request()} direction="incoming" busy={false} {...handlers} />);

    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('@alex')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/Wants to connect/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /accept/i }));
    await user.click(screen.getByRole('button', { name: /reject/i }));
    await user.click(screen.getByRole('button', { name: /view profile/i }));

    expect(handlers.onAccept).toHaveBeenCalledTimes(1);
    expect(handlers.onReject).toHaveBeenCalledTimes(1);
    expect(handlers.onViewProfile).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it('shows cancel for outgoing requests and disables actions while busy', () => {
    const handlers = actions();
    render(<FriendRequestCard request={request()} direction="outgoing" busy {...handlers} />);

    expect(screen.getByText(/You sent a request/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel request/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  });

  it('hides decision actions for requests that are no longer pending', () => {
    render(<FriendRequestCard request={request({ status: 'ACCEPTED' })} direction="incoming" busy={false} {...actions()} />);

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument();
  });
});
