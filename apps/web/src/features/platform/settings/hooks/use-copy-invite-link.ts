'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@app/ui';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

/**
 * Settings › Invitations › Copy link: asks for a new link for a pending invitation and puts it on the clipboard, for
 * when the invite email never arrived. Tokens are stored hashed, so a link cannot be read back: the server rotates
 * the token and shows the new link once. The link in the invitation email stops working, so the page confirms first.
 */
export function useCopyInviteLink() {
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { inviteLink } = await apiClient<{ inviteLink: string }>(`/invitations/${invitationId}/link`, {
        method: 'POST',
      });
      await navigator.clipboard.writeText(inviteLink);
    },
    onSuccess: () => showSuccess('New invite link copied'),
    onError: (error: Error) => showError("Couldn't copy the invite link", extractErrorMessage(error)),
  });
}
