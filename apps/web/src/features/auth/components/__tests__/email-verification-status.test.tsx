/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { EmailVerificationStatus } from '../email-verification-status';

jest.mock('../../api', () => ({ authApi: { resendVerification: jest.fn() } }));

describe('EmailVerificationStatus', () => {
  it('says Verified only for emailVerified === true, with no resend', () => {
    render(<EmailVerificationStatus emailVerified />);
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull();
  });

  it.each([false, undefined])('treats emailVerified=%s as unverified and offers a resend', (emailVerified) => {
    render(<EmailVerificationStatus emailVerified={emailVerified} />);
    expect(screen.getByText('Unverified')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeTruthy();
  });
});
