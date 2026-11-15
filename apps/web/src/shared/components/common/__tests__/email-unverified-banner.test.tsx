/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { EmailUnverifiedBanner, EMAIL_UNVERIFIED_BANNER_DISMISSED_KEY } from '../email-unverified-banner';
import { ApiError } from '@appshore/web-core/shared/lib/api';

let mockUser: { emailVerified?: boolean } | null = null;

jest.mock('@/features/auth', () => ({
  useAuthStore: (select: (state: { user: typeof mockUser }) => unknown) => select({ user: mockUser }),
}));
jest.mock('@/features/auth/api', () => ({ authApi: { resendVerification: jest.fn() } }));
jest.mock('@appshore/web-core/shared/lib/toast', () => ({ showSuccess: jest.fn(), showError: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authApi } = require('@/features/auth/api') as { authApi: { resendVerification: jest.Mock } };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const toast = require('@appshore/web-core/shared/lib/toast') as { showSuccess: jest.Mock; showError: jest.Mock };

const COPY = 'Verify your email to join other workspaces.';

describe('EmailUnverifiedBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows only when the profile says emailVerified === false', async () => {
    for (const shape of [null, {}, { emailVerified: true }]) {
      mockUser = shape;
      const { unmount } = render(<EmailUnverifiedBanner />);
      expect(screen.queryByText(COPY)).toBeNull();
      unmount();
    }
    mockUser = { emailVerified: false };
    render(<EmailUnverifiedBanner />);
    expect(await screen.findByText(COPY)).toBeTruthy();
  });

  it('resend posts and toasts success; a 429 says to wait a minute', async () => {
    mockUser = { emailVerified: false };
    authApi.resendVerification.mockResolvedValueOnce(undefined);
    render(<EmailUnverifiedBanner />);

    (await screen.findByRole('button', { name: 'Resend email' })).click();
    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledTimes(1));

    authApi.resendVerification.mockRejectedValueOnce(new ApiError(429, 'Too many', { code: 'RATE_LIMITED' }));
    screen.getByRole('button', { name: 'Resend email' }).click();
    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Wait a minute before asking again'));
  });

  it('dismiss hides it for the session', async () => {
    mockUser = { emailVerified: false };
    const { unmount } = render(<EmailUnverifiedBanner />);
    (await screen.findByRole('button', { name: 'Dismiss' })).click();
    await waitFor(() => expect(screen.queryByText(COPY)).toBeNull());
    expect(sessionStorage.getItem(EMAIL_UNVERIFIED_BANNER_DISMISSED_KEY)).toBe('1');
    unmount();

    render(<EmailUnverifiedBanner />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(COPY)).toBeNull();
  });
});
