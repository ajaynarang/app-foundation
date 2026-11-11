/**
 * @jest-environment jsdom
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@app/ui';
import { useCopyInviteLink } from '../use-copy-invite-link';

jest.mock('@appshore/web-core/shared/lib/api', () => ({ apiClient: jest.fn() }));
jest.mock('@app/ui', () => ({ showSuccess: jest.fn(), showError: jest.fn() }));

const request = apiClient as jest.Mock;
const writeText = jest.fn();
const INVITATION_ID = '5f0c1a52-6f0e-4c58-9d1b-0d6f6a1f7f11';
const INVITE_LINK = 'https://app.example.com/accept-invitation?token=t';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCopyInviteLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("reads the pending invitation's link and puts it on the clipboard", async () => {
    request.mockResolvedValue({ inviteLink: INVITE_LINK });
    writeText.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCopyInviteLink(), { wrapper });

    act(() => result.current.mutate(INVITATION_ID));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Invite link copied'));
    expect(request).toHaveBeenCalledWith(`/invitations/${INVITATION_ID}/link`);
    expect(writeText).toHaveBeenCalledWith(INVITE_LINK);
    expect(showError).not.toHaveBeenCalled();
  });

  it('says so, and copies nothing, when the link cannot be read', async () => {
    request.mockRejectedValue(new Error('Cannot get link for invitation with status ACCEPTED'));
    const { result } = renderHook(() => useCopyInviteLink(), { wrapper });

    act(() => result.current.mutate(INVITATION_ID));

    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't copy the invite link", expect.any(String)));
    expect(writeText).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('reports a failure, not success, when the browser refuses the clipboard write', async () => {
    request.mockResolvedValue({ inviteLink: INVITE_LINK });
    writeText.mockRejectedValue(new Error('Write permission denied.'));
    const { result } = renderHook(() => useCopyInviteLink(), { wrapper });

    act(() => result.current.mutate(INVITATION_ID));

    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't copy the invite link", expect.any(String)));
    expect(showSuccess).not.toHaveBeenCalled();
  });
});
