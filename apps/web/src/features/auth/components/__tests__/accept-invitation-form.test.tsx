/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@appshore/web-core/shared/lib/api';
import { AcceptInvitationForm } from '../accept-invitation-form';

const mockPush = jest.fn();
const mockAuthState = {
  isAuthenticated: false,
  _hasHydrated: true,
  user: null as null | { email: string },
  setSession: jest.fn(),
  setTokens: jest.fn(),
  setUser: jest.fn(),
  signOut: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams({ token: 'raw-invite-token' }),
}));
jest.mock('@/features/auth', () => ({ useAuthStore: () => mockAuthState }));
jest.mock('../../api', () => ({
  authApi: {
    sendPhoneOtp: jest.fn(),
    acceptInvitation: jest.fn(),
    joinInvitation: jest.fn(),
    getProfile: jest.fn(),
  },
}));
jest.mock('@/features/platform/workspaces/api', () => ({ workspacesApi: { switch: jest.fn() } }));
jest.mock('@appshore/web-core/shared/lib/toast', () => ({ showSuccess: jest.fn(), showError: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authApi } = require('../../api') as { authApi: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { workspacesApi } = require('@/features/platform/workspaces/api') as { workspacesApi: { switch: jest.Mock } };

const PREVIEW = {
  invitationId: 'inv_1',
  email: 'invitee@example.com',
  phone: null,
  inviteChannel: 'EMAIL',
  firstName: 'Pat',
  lastName: 'Lee',
  role: 'MEMBER',
  expiresAt: '2026-12-01T00:00:00.000Z',
  tenant: { tenantId: 'ten_1', companyName: 'Acme', subdomain: null },
  invitedBy: { firstName: 'Olive', lastName: 'Owner' },
};

const apiError = (status: number, code: string, detail = 'refused') =>
  new ApiError(status, detail, { statusCode: status, code, detail });

const fillPasswords = (password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText('Create a password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
};

describe('AcceptInvitationForm', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.isAuthenticated = false;
    mockAuthState.user = null;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => PREVIEW });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('loads the invitation with POST /invitations/preview, the token in the body and never in the URL', async () => {
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

  it('signed out: creates the account with a password, takes the session, and goes to the role home', async () => {
    const session = { accessToken: 'jwt', user: { userId: 'user_1', role: 'MEMBER' } };
    authApi.acceptInvitation.mockResolvedValue(session);
    render(<AcceptInvitationForm />);
    await screen.findByText('Create your account');

    fillPasswords('Password123!');
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));

    await waitFor(() => expect(authApi.acceptInvitation).toHaveBeenCalledWith('raw-invite-token', 'Password123!'));
    expect(mockAuthState.setSession).toHaveBeenCalledWith(session);
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  it('asks for at least 8 characters, as the backend does, before posting', async () => {
    render(<AcceptInvitationForm />);
    await screen.findByText('Create your account');

    fillPasswords('short12');
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeTruthy();
    expect(authApi.acceptInvitation).not.toHaveBeenCalled();
  });

  it('a 409 SIGN_IN_TO_ACCEPT switches to the sign-in panel, which returns to this invitation after login', async () => {
    authApi.acceptInvitation.mockRejectedValue(apiError(409, 'SIGN_IN_TO_ACCEPT'));
    render(<AcceptInvitationForm />);
    await screen.findByText('Create your account');

    fillPasswords('Password123!');
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));

    expect(await screen.findByText(/An account already uses this email/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign in to accept' });
    expect(link.getAttribute('href')).toBe(
      `/login?redirect=${encodeURIComponent('/accept-invitation?token=raw-invite-token')}`,
    );
    expect(mockAuthState.setSession).not.toHaveBeenCalled();
  });

  it('signed in: joins, switches to the workspace, and never shows the create-account form', async () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.user = { email: 'invitee@example.com' };
    authApi.joinInvitation.mockResolvedValue({ workspace: { tenantId: 'ten_1', name: 'Acme' }, role: 'MEMBER' });
    workspacesApi.switch.mockResolvedValue({ accessToken: 'jwt2' });
    authApi.getProfile.mockResolvedValue({ userId: 'user_1', role: 'MEMBER' });
    render(<AcceptInvitationForm />);

    fireEvent.click(await screen.findByRole('button', { name: 'Join Acme as MEMBER' }));

    await waitFor(() => expect(workspacesApi.switch).toHaveBeenCalledWith('ten_1'));
    expect(authApi.joinInvitation).toHaveBeenCalledWith('raw-invite-token');
    expect(mockAuthState.setTokens).toHaveBeenCalledWith('jwt2');
    expect(screen.queryByLabelText('Create a password')).toBeNull();
  });

  it('a mismatch names who is signed in and who is invited, and offers to sign out', async () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.user = { email: 'me@example.com' };
    authApi.joinInvitation.mockRejectedValue(apiError(403, 'INVITATION_EMAIL_MISMATCH'));
    render(<AcceptInvitationForm />);

    fireEvent.click(await screen.findByRole('button', { name: 'Join Acme as MEMBER' }));

    expect(
      await screen.findByText('Signed in as me@example.com. This invitation is for invitee@example.com.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and continue' }));
    await waitFor(() => expect(mockAuthState.signOut).toHaveBeenCalled());
    expect(workspacesApi.switch).not.toHaveBeenCalled();
  });
});
