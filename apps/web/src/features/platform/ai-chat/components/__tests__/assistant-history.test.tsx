/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { ConversationSummary } from '@app/shared-types';
import { AssistantHistory } from '../AssistantHistory';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));
jest.mock('@/features/auth', () => ({ useAuthStore: { getState: () => ({ accessToken: null }) } }));
jest.mock('@app/ui', () => ({ ...jest.requireActual('@app/ui'), showSuccess: jest.fn(), showError: jest.fn() }));

const request = apiClient as jest.Mock;

const conversation = (id: string, title: string): ConversationSummary => ({
  conversationId: id,
  userMode: 'member',
  title,
  messageCount: 4,
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

function renderHistory(props: Partial<Parameters<typeof AssistantHistory>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpen = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <AssistantHistory onOpen={onOpen} {...props} />
    </QueryClientProvider>,
  );
  return { onOpen };
}

describe('AssistantHistory', () => {
  beforeEach(() => request.mockReset());

  it('lists conversations, asks for the history cap, and opens one', async () => {
    request.mockResolvedValue({ conversations: [conversation('conv_1', 'Inviting teammates')] });
    const { onOpen } = renderHistory();

    fireEvent.click(await screen.findByText('Inviting teammates'));

    expect(onOpen).toHaveBeenCalledWith('conv_1');
    expect(request).toHaveBeenCalledWith('/conversations?limit=30');
    expect(screen.getByText('History keeps your last 30 conversations')).toBeTruthy();
  });

  it('removes a conversation only after the person confirms, through DELETE', async () => {
    request.mockImplementation(async (path: string, init?: { method?: string }) =>
      init?.method === 'DELETE' ? undefined : { conversations: [conversation('conv_1', 'Inviting teammates')] },
    );
    const onActiveRemoved = jest.fn();
    renderHistory({ activeId: 'conv_1', onActiveRemoved });

    await screen.findByText('Inviting teammates');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Inviting teammates from history' }));
    expect(request).not.toHaveBeenCalledWith('/conversations/conv_1', { method: 'DELETE' });

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/conversations/conv_1', { method: 'DELETE' }));
    await waitFor(() => expect(onActiveRemoved).toHaveBeenCalled());
  });

  it('a failed load reads as an error with Retry, never as an empty history', async () => {
    request.mockRejectedValue(new Error('network down'));
    renderHistory();

    expect(await screen.findByText("Couldn't load your conversations.")).toBeTruthy();
    expect(screen.queryByText('No conversations yet')).toBeNull();
  });

  it('says so when there is nothing yet', async () => {
    request.mockResolvedValue({ conversations: [] });
    renderHistory();

    expect(await screen.findByText('No conversations yet')).toBeTruthy();
  });
});
