import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../providers';
import type { FriendRequest } from '../lib/types';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../lib/api';
import { RequestsView } from './RequestsView';

const mockedFetch = vi.mocked(apiFetch);
const sender = { id: 'u1', username: 'alex', displayName: 'Alex Rivera' };
const receiver = { id: 'u2', username: 'sam', displayName: 'Sam Lee' };

function request(id: string, status: FriendRequest['status'] = 'PENDING'): FriendRequest {
  return {
    id,
    senderId: sender.id,
    receiverId: receiver.id,
    status,
    createdAt: '2026-10-30T08:00:00.000Z',
    sender,
    receiver,
  };
}

describe('RequestsView', () => {
  it('accepts incoming requests, refreshes data and reports success', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    mockedFetch.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <RequestsView requests={{ incoming: [request('incoming-1')], outgoing: [] }} onRefresh={onRefresh} onViewProfile={vi.fn()} onFindFriends={vi.fn()} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /accept/i }));

    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/friend-requests/incoming-1/accept', { method: 'POST' });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Friend added')).toBeInTheDocument();
    expect(screen.getByText(/You are now friends with @alex/)).toBeInTheDocument();
  });

  it('switches tabs and cancels an outgoing request', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    mockedFetch.mockResolvedValue(undefined);

    render(
      <ToastProvider>
        <RequestsView requests={{ incoming: [], outgoing: [request('outgoing-1')] }} onRefresh={onRefresh} onViewProfile={vi.fn()} onFindFriends={vi.fn()} />
      </ToastProvider>,
    );

    expect(screen.getByText('No incoming requests')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /outgoing/i }));
    expect(screen.getByText(/You sent a request/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel request/i }));
    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/friend-requests/outgoing-1/cancel', { method: 'POST' });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Friend request cancelled.')).toBeInTheDocument();
  });
});
