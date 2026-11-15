'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { showError, showSuccess } from '@app/ui';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

/**
 * Settings › Invitations › Copy link: reads a pending invitation's link
 * (its token is unchanged) and puts it on the clipboard, for when the
 * invite email never arrived.
 */
export function useCopyInviteLink() {
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { inviteLink } = await apiClient<{ inviteLink: string }>(`/invitations/${invitationId}/link`);
      await navigator.clipboard.writeText(inviteLink);
    },
    onSuccess: () => showSuccess('Invite link copied'),
    onError: (error: Error) => showError("Couldn't copy the invite link", extractErrorMessage(error)),
  });
}
