import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { extractErrorMessage } from '@/shared/lib/error-utils';

import { deskApi } from '../api';
import type { AgentKey, ListMemoriesQuery, UpdateMemoryRequest } from '../types';

export function useMemories(query?: ListMemoriesQuery, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.desk.memories(query as Record<string, unknown>),
    queryFn: () => deskApi.memories.list(query),
    // Memories are always scoped to a specific agent — skip the fetch when
    // no agentKey is set OR when the caller explicitly disables the hook
    // (e.g. sheet closed). Prevents background pings from mounted-but-hidden
    // sheets.
    enabled: opts.enabled !== false && Boolean(query?.agentKey),
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: UpdateMemoryRequest }) => deskApi.memories.update(input.id, input.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.memories() });
      showSuccess('Memory updated');
    },
    onError: (error: Error) => {
      showError('Failed to update memory', extractErrorMessage(error));
    },
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deskApi.memories.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.memories() });
      showSuccess('Memory removed');
    },
    onError: (error: Error) => {
      showError('Failed to remove memory', extractErrorMessage(error));
    },
  });
}

export function useSetMemoryPinned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; isPinned: boolean }) =>
      deskApi.memories.setPinned(input.id, { isPinned: input.isPinned }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.memories() });
      showSuccess(vars.isPinned ? 'Pinned — exempt from auto-decay' : 'Unpinned');
    },
    onError: (error: Error) => {
      showError('Failed to update pin', extractErrorMessage(error));
    },
  });
}

export function useAddPlaybookRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { agentKey: AgentKey; content: string }) => deskApi.memories.addPlaybookRule(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.desk.memories() });
      showSuccess('Rule added');
    },
    onError: (error: Error) => {
      showError('Failed to add rule', extractErrorMessage(error));
    },
  });
}
