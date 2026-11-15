/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from '../page';
import { ApiError } from '@appshore/web-core/shared/lib/api';

const mockAuthState = { isAuthenticated: true, _hasHydrated: true, setUser: jest.fn() };
let mockToken = 'a'.repeat(64);

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockToken ? { token: mockToken } : {}),
}));
jest.mock('@/features/auth', () => ({ useAuthStore: () => mockAuthState }));
jest.mock('@/features/auth/api', () => ({
  authApi: { verifyEmail: jest.fn(), resendVerification: jest.fn(), getProfile: jest.fn() },
}));
jest.mock('@appshore/web-core/shared/lib/toast', () => ({ showSuccess: jest.fn(), showError: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authApi } = require('@/features/auth/api') as {
  authApi: { verifyEmail: jest.Mock; resendVerification: jest.Mock; getProfile: jest.Mock };
};

const invalidLink = () =>
  new ApiError(400, 'This verification link is invalid or has expired.', {
    statusCode: 400,
    code: 'VERIFICATION_LINK_INVALID',
    detail: 'This verification link is invalid or has expired.',
  });

describe('/verify-email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.isAuthenticated = true;
    mockToken = 'a'.repeat(64);
  });

  it('signed out: asks to sign in and links to login with a redirect back here, posting nothing', async () => {
    mockAuthState.isAuthenticated = false;

    render(<VerifyEmailPage />);

    expect(await screen.findByText('Sign in to verify your email')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe(
      `/login?redirect=${encodeURIComponent(`/verify-email?token=${'a'.repeat(64)}`)}`,
    );
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });

  it('signed in: posts the token once, refreshes the profile and shows success', async () => {
    authApi.verifyEmail.mockResolvedValue(undefined);
    authApi.getProfile.mockResolvedValue({ userId: 'u', emailVerified: true });

    const { rerender } = render(<VerifyEmailPage />);
    rerender(<VerifyEmailPage />);

    expect(await screen.findByText('Email verified')).toBeTruthy();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
    expect(authApi.verifyEmail).toHaveBeenCalledWith('a'.repeat(64));
    expect(mockAuthState.setUser).toHaveBeenCalledWith({ userId: 'u', emailVerified: true });
  });

  it('a used link on an already verified account (a second tab) shows success, not an error', async () => {
    authApi.verifyEmail.mockRejectedValue(invalidLink());
    authApi.getProfile.mockResolvedValue({ userId: 'u', emailVerified: true });

    render(<VerifyEmailPage />);

    expect(await screen.findByText('Email verified')).toBeTruthy();
  });

  it('an invalid link on an unverified account explains and offers a resend', async () => {
    authApi.verifyEmail.mockRejectedValue(invalidLink());
    authApi.getProfile.mockResolvedValue({ userId: 'u', emailVerified: false });
    authApi.resendVerification.mockResolvedValue(undefined);

    render(<VerifyEmailPage />);

    expect(await screen.findByText('This link is invalid, has expired, or belongs to another account.')).toBeTruthy();
    screen.getByRole('button', { name: 'Resend email' }).click();
    await waitFor(() => expect(authApi.resendVerification).toHaveBeenCalledTimes(1));
  });
});
