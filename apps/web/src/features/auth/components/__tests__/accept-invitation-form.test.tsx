/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { AcceptInvitationForm } from '../accept-invitation-form';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams({ token: 'raw-invite-token' }),
}));
jest.mock('firebase/auth', () => ({ createUserWithEmailAndPassword: jest.fn() }));
jest.mock('@appshore/web-core/shared/lib/firebase', () => ({ auth: {} }));
jest.mock('@/features/auth', () => ({
  useAuthStore: () => ({ exchangeFirebaseToken: jest.fn(), setTokens: jest.fn(), setUser: jest.fn() }),
}));
jest.mock('../../api', () => ({ authApi: { sendPhoneOtp: jest.fn() } }));

const PREVIEW = {
  invitationId: 'inv_1',
  email: 'invitee@example.com',
  phone: null,
  inviteChannel: 'EMAIL',
  firstName: 'Pat',
  lastName: 'Lee',
  role: 'MEMBER',
  expiresAt: '2026-12-01T00:00:00.000Z',
  tenant: { tenantId: 'ten_1', companyName: 'Acme', subdomain: 'acme' },
  invitedBy: { firstName: 'Olive', lastName: 'Owner' },
};

describe('AcceptInvitationForm', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('loads the invitation with POST /invitations/preview, the token in the body and never in the URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => PREVIEW });

    render(<AcceptInvitationForm />);

    expect(await screen.findByText('Acme')).toBeTruthy();
    expect(screen.getByText('Olive Owner')).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/invitations\/preview$/);
    expect(url).not.toContain('raw-invite-token');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(init.body)).toEqual({ token: 'raw-invite-token' });
  });

  it('shows the server detail when the invitation is no longer valid', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ statusCode: 409, code: 'INVALID_STATE', detail: 'This invitation is no longer valid' }),
    });

    render(<AcceptInvitationForm />);

    await waitFor(() => expect(screen.getByText('This invitation is no longer valid')).toBeTruthy());
  });
});
