'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@app/ui';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { MAX_ACTIVE_CONVERSATIONS } from '@app/shared-types';
import { deleteConversation, listConversations } from '../api';

/** This person's active conversations, newest first. Refetched on every mount: messages land outside the cache. */
export function useConversationHistory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: () => listConversations(MAX_ACTIVE_CONVERSATIONS),
    enabled,
    refetchOnMount: 'always',
  });
}

/** Remove a conversation from history (the server archives it; its messages are kept). */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.root });
      showSuccess('Conversation removed from history');
    },
    onError: (error: Error) => showError('Could not remove the conversation', extractErrorMessage(error)),
  });
}
