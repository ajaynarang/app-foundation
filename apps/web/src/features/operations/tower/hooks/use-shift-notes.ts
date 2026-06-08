import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';
import { commandCenterApi } from '../api';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useShiftNotes() {
  return useQuery({
    queryKey: [...queryKeys.commandCenter.shiftNotes],
    queryFn: () => commandCenterApi.getShiftNotes(),
  });
}

export function useCreateShiftNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, isPinned, priority }: { content: string; isPinned?: boolean; priority?: string }) =>
      commandCenterApi.createShiftNote(content, isPinned, priority),
    onSuccess: () => {
      showSuccess('Shift note created');
      queryClient.invalidateQueries({ queryKey: queryKeys.commandCenter.shiftNotes });
    },
    onError: (error: Error) => {
      showError('Failed to create shift note', extractErrorMessage(error));
    },
  });
}

export function useAcknowledgeHandoff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => commandCenterApi.acknowledgeHandoff(),
    onSuccess: () => {
      showSuccess('Handoff acknowledged');
      queryClient.invalidateQueries({ queryKey: queryKeys.commandCenter.shiftNotes });
    },
    onError: (error: Error) => {
      showError('Failed to acknowledge handoff', extractErrorMessage(error));
    },
  });
}

export function useTogglePinShiftNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => commandCenterApi.togglePinShiftNote(noteId),
    onSuccess: (data) => {
      showSuccess(data.isPinned ? 'Note pinned' : 'Note unpinned');
      queryClient.invalidateQueries({ queryKey: queryKeys.commandCenter.shiftNotes });
    },
    onError: (error: Error) => {
      showError('Failed to update note', extractErrorMessage(error));
    },
  });
}

export function useDeleteShiftNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => commandCenterApi.deleteShiftNote(noteId),
    onSuccess: () => {
      showSuccess('Shift note deleted');
      queryClient.invalidateQueries({ queryKey: queryKeys.commandCenter.shiftNotes });
    },
    onError: (error: Error) => {
      showError('Failed to delete shift note', extractErrorMessage(error));
    },
  });
}
