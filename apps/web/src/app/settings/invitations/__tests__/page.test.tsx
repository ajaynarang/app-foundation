/**
 * @jest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, apiClient } from '@appshore/web-core/shared/lib/api';
import InvitationsPage from '../page';

jest.mock('@appshore/web-core/shared/lib/api', () => ({
  apiClient: jest.fn(),
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@appshore/web-core/shared/lib/toast', () => ({ showSuccess: jest.fn(), showError: jest.fn() }));
jest.mock('@app/ui', () => ({ showSuccess: jest.fn(), showError: jest.fn() }));

const request = apiClient as jest.Mock;
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const writeText = jest.fn();

// The list names a row by its public id only (the numeric key never leaves the API). Every
// /invitations/:invitation_id route looks the row up by that uuid.
const PENDING = {
  invitationId: '5f0c1a52-6f0e-4c58-9d1b-0d6f6a1f7f11',
  email: 'pat@example.com',
  firstName: 'Pat',
  lastName: 'Lee',
  role: 'MEMBER',
  status: 'PENDING',
  createdAt: '2026-01-05T10:00:00.000Z',
  expiresAt: '2026-01-12T10:00:00.000Z',
};
const EXPIRED = { ...PENDING, invitationId: '9b0f4f3e-2a53-4f0c-8a39-2a0c1a4f9d22', status: 'EXPIRED' };

/** One page of the cursor list `GET /invitations` answers. */
const page = (items: unknown[], nextCursor: string | null = null, total = items.length) => ({
  items,
  nextCursor,
  total,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InvitationsPage />
    </QueryClientProvider>,
  );
}

describe('Settings › Invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
    writeText.mockResolvedValue(undefined);
    post.mockResolvedValue({});
    request.mockResolvedValue({});
  });

  it("copies a pending invitation's link, asking for it by the invitation's public id", async () => {
    get.mockResolvedValue(page([PENDING]));
    request.mockResolvedValue({ inviteLink: 'https://app.example.com/accept-invitation?token=t' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.example.com/accept-invitation?token=t'));
    expect(request).toHaveBeenCalledWith(`/invitations/${PENDING.invitationId}/link`);
  });

  it('offers no link for an expired invitation: its token no longer works', async () => {
    get.mockResolvedValue(page([EXPIRED]));
    renderPage();

    await screen.findByRole('button', { name: 'Resend' });
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  it('resends and cancels by the public id, not the numeric row id', async () => {
    get.mockResolvedValue(page([PENDING]));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/invitations/${PENDING.invitationId}/resend`));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        `/invitations/${PENDING.invitationId}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('asks the server for actionable invitations only, and loads the next page with the cursor it was given', async () => {
    get.mockResolvedValueOnce(page([PENDING], 'next-page', 2)).mockResolvedValueOnce(page([EXPIRED], null, 2));
    renderPage();

    // The server filters: nothing is filtered out of a loaded page in the browser.
    await screen.findByText('Showing 1 of 2');
    expect(get.mock.calls[0][0]).toBe('/invitations?status=PENDING%2CEXPIRED');

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await screen.findByText('Showing 2 of 2');
    expect(get.mock.calls[1][0]).toBe('/invitations?status=PENDING%2CEXPIRED&cursor=next-page');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
