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

// The list returns both ids. Every /invitations/:invitation_id route looks the
// row up by the uuid; the numeric id finds nothing there.
const PENDING = {
  id: 41,
  invitationId: '5f0c1a52-6f0e-4c58-9d1b-0d6f6a1f7f11',
  email: 'pat@example.com',
  firstName: 'Pat',
  lastName: 'Lee',
  role: 'MEMBER',
  status: 'PENDING',
  createdAt: '2026-01-05T10:00:00.000Z',
  expiresAt: '2026-01-12T10:00:00.000Z',
};
const EXPIRED = { ...PENDING, id: 42, invitationId: '9b0f4f3e-2a53-4f0c-8a39-2a0c1a4f9d22', status: 'EXPIRED' };

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
    get.mockResolvedValue([PENDING]);
    request.mockResolvedValue({ inviteLink: 'https://app.example.com/accept-invitation?token=t' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.example.com/accept-invitation?token=t'));
    expect(request).toHaveBeenCalledWith(`/invitations/${PENDING.invitationId}/link`);
  });

  it('offers no link for an expired invitation: its token no longer works', async () => {
    get.mockResolvedValue([EXPIRED]);
    renderPage();

    await screen.findByRole('button', { name: 'Resend' });
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
  });

  it('resends and cancels by the public id, not the numeric row id', async () => {
    get.mockResolvedValue([PENDING]);
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
});
