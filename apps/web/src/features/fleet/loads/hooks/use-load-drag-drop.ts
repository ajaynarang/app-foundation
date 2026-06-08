import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragStartEvent, DragEndEvent, Announcements } from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import type { LoadListItem, LoadStatus, PaginatedLoads } from '@/features/fleet/loads/types';
import { queryKeys } from '@/shared/constants';
import { showSuccess, showSuccessWithLink, showError } from '@sally/ui';

/** Map of valid drag transitions: [sourceStatus] → { targetStatus, actionLabel } */
export type DragTransition = {
  target: LoadStatus | 'delivered' | 'DELIVERED';
  label: string;
  direction: 'forward' | 'backward' | 'terminal';
  needsInput: boolean;
};

const DRAG_TRANSITIONS: Record<string, DragTransition> = {
  // Forward
  'DRAFT→PENDING': { target: 'PENDING', label: 'Drop to confirm load', direction: 'forward', needsInput: false },
  'PENDING→ASSIGNED': { target: 'ASSIGNED', label: 'Drop to assign driver', direction: 'forward', needsInput: true },
  'ASSIGNED→IN_TRANSIT': {
    target: 'IN_TRANSIT',
    label: 'Drop to mark picked up',
    direction: 'forward',
    needsInput: false,
  },
  'IN_TRANSIT→delivered': {
    target: 'delivered',
    label: 'Drop to mark delivered',
    direction: 'terminal',
    needsInput: false,
  },
  // Backward
  'PENDING→DRAFT': { target: 'DRAFT', label: 'Drop to move to draft', direction: 'backward', needsInput: false },
  'ASSIGNED→PENDING': { target: 'PENDING', label: 'Drop to unassign', direction: 'backward', needsInput: false },
  'IN_TRANSIT→ASSIGNED': {
    target: 'ASSIGNED',
    label: 'Drop to revert to assigned',
    direction: 'backward',
    needsInput: true,
  },
};

export function getTransition(sourceStatus: string, targetStatus: string): DragTransition | null {
  return DRAG_TRANSITIONS[`${sourceStatus}→${targetStatus}`] ?? null;
}

export function getValidTargets(sourceStatus: string): string[] {
  return Object.keys(DRAG_TRANSITIONS)
    .filter((key) => key.startsWith(`${sourceStatus}→`))
    .map((key) => key.split('→')[1]);
}

type DragState = {
  activeLoad: LoadListItem | null;
  activeSourceStatus: LoadStatus | null;
  validTargets: string[];
};

type UseLoadDragDropOptions = {
  loads: LoadListItem[];
  updateStatusApi: (loadId: string, status: string) => Promise<unknown>;
  /** Advance a relay leg's status instead of the load's status */
  advanceLegStatusApi?: (loadId: string, legId: string, status: string) => Promise<unknown>;
  onAssignDriver: (load: LoadListItem) => void;
  onRevertStatus: (load: LoadListItem) => void;
};

export function useLoadDragDrop({
  loads,
  updateStatusApi,
  advanceLegStatusApi,
  onAssignDriver,
  onRevertStatus,
}: UseLoadDragDropOptions) {
  const queryClient = useQueryClient();
  const boardKey = queryKeys.loads.board;

  const mutateBoard = useCallback(
    (mutator: (loads: LoadListItem[]) => LoadListItem[]) => {
      queryClient.setQueryData<PaginatedLoads>(boardKey, (prev) => {
        if (!prev) return prev;
        return { ...prev, data: mutator(prev.data) };
      });
    },
    [queryClient, boardKey],
  );

  const snapshotBoard = useCallback(
    (): PaginatedLoads | undefined => queryClient.getQueryData<PaginatedLoads>(boardKey),
    [queryClient, boardKey],
  );

  const restoreBoard = useCallback(
    (snapshot: PaginatedLoads | undefined) => {
      if (snapshot) queryClient.setQueryData(boardKey, snapshot);
    },
    [queryClient, boardKey],
  );
  const [dragState, setDragState] = useState<DragState>({
    activeLoad: null,
    activeSourceStatus: null,
    validTargets: [],
  });
  const [pendingMutation, setPendingMutation] = useState<string | null>(null);
  const didDragRef = useRef(false);
  const deliveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current);
    };
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const loadId = event.active.id as string;
      const load = loads.find((l) => l.loadNumber === loadId);
      if (!load) return;

      didDragRef.current = true;
      const targets = getValidTargets(load.status);
      setDragState({
        activeLoad: load,
        activeSourceStatus: load.status as LoadStatus,
        validTargets: targets,
      });
    },
    [loads],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active: _active, over } = event;
      const load = dragState.activeLoad;
      const sourceStatus = dragState.activeSourceStatus;

      // Reset drag state immediately
      setDragState({ activeLoad: null, activeSourceStatus: null, validTargets: [] });

      if (!load || !sourceStatus || !over) return;

      const targetStatus = over.id as string;
      const transition = getTransition(sourceStatus, targetStatus);
      if (!transition) return;

      // If the transition needs input, open the appropriate dialog
      if (transition.needsInput) {
        if (transition.target === 'ASSIGNED' && transition.direction === 'forward') {
          onAssignDriver(load);
        } else {
          onRevertStatus(load);
        }
        return;
      }

      // Snapshot current cache so we can roll back on error
      const previousSnapshot = snapshotBoard();

      if (transition.target === 'delivered') {
        // Fade out: mark as delivered (triggers CSS animation), then remove after 300ms
        mutateBoard((prev) =>
          prev.map((l) => (l.loadNumber === load.loadNumber ? { ...l, status: 'DELIVERED' as LoadStatus } : l)),
        );
        deliveredTimerRef.current = setTimeout(() => {
          mutateBoard((prev) => prev.filter((l) => l.loadNumber !== load.loadNumber));
          deliveredTimerRef.current = null;
        }, 300);
      } else {
        // Move to new column
        mutateBoard((prev) =>
          prev.map((l) => (l.loadNumber === load.loadNumber ? { ...l, status: transition.target as LoadStatus } : l)),
        );
      }

      // Fire the mutation asynchronously (not making the callback itself async)
      setPendingMutation(load.loadNumber);
      const apiStatus = transition.target === 'delivered' ? 'DELIVERED' : transition.target;

      // For relay loads with an active leg, advance the leg instead of the load
      const isRelayLegAdvance = load.isRelay && load.activeLeg && advanceLegStatusApi;
      const mutationPromise = isRelayLegAdvance
        ? advanceLegStatusApi(load.loadNumber, load.activeLeg!.legId, apiStatus)
        : updateStatusApi(load.loadNumber, apiStatus);

      mutationPromise
        .then(() => {
          // Show success toast
          const toastMessages: Record<string, string> = {
            'DRAFT→PENDING': `Load ${load.loadNumber} confirmed`,
            'PENDING→DRAFT': `Load ${load.loadNumber} moved to drafts`,
            'ASSIGNED→PENDING': `Load ${load.loadNumber} unassigned`,
            'ASSIGNED→IN_TRANSIT': `Load ${load.loadNumber} marked picked up`,
          };
          const key = `${sourceStatus}→${targetStatus}`;
          const message = toastMessages[key];
          if (isRelayLegAdvance) {
            const legSeq = load.activeLeg!.sequence;
            showSuccess(
              `Load ${load.loadNumber} — Leg ${legSeq} ${apiStatus === 'IN_TRANSIT' ? 'picked up' : apiStatus}`,
            );
          } else if (message) {
            showSuccess(message);
          }
          if (targetStatus === 'delivered' && !isRelayLegAdvance) {
            showSuccessWithLink(
              `Load ${load.loadNumber} marked delivered`,
              'View in History',
              '/dispatcher/loads?tab=history',
            );
          }

          // Re-fetch authoritative state from server (replaces silentRefresh).
          // Mutation also already invalidates queryKeys.loads.root via useUpdateLoadStatus,
          // but DnD bypasses that hook, so we trigger it explicitly here.
          queryClient.invalidateQueries({ queryKey: queryKeys.loads.root });
        })
        .catch(() => {
          // Cancel delivered fade-out timer if still pending
          if (deliveredTimerRef.current) {
            clearTimeout(deliveredTimerRef.current);
            deliveredTimerRef.current = null;
          }
          // Revert optimistic update
          restoreBoard(previousSnapshot);
          showError('Status update failed', 'Could not update load status');
        })
        .finally(() => {
          setPendingMutation(null);
        });
    },
    [
      dragState,
      updateStatusApi,
      advanceLegStatusApi,
      onAssignDriver,
      onRevertStatus,
      mutateBoard,
      snapshotBoard,
      restoreBoard,
      queryClient,
    ],
  );

  const handleDragCancel = useCallback(() => {
    didDragRef.current = false;
    setDragState({ activeLoad: null, activeSourceStatus: null, validTargets: [] });
  }, []);

  const shouldSuppressClick = useCallback(() => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    dragState,
    pendingMutation,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    shouldSuppressClick,
  };
}

// Accessibility announcements for screen readers
export const dndAccessibility: { announcements: Announcements } = {
  announcements: {
    onDragStart({ active }) {
      const load = active.data.current?.load as LoadListItem | undefined;
      return `Grabbed load ${load?.loadNumber ?? active.id}. Use arrow keys to move.`;
    },
    onDragOver({ active, over }) {
      const load = active.data.current?.load as LoadListItem | undefined;
      if (!over) return `Load ${load?.loadNumber ?? active.id} is not over a drop zone.`;
      const transition = getTransition(load?.status ?? '', over.id as string);
      if (transition) {
        return `Load ${load?.loadNumber ?? active.id} over ${over.id} column — ${transition.label}.`;
      }
      return `Load ${load?.loadNumber ?? active.id} over ${over.id} — invalid drop target.`;
    },
    onDragEnd({ active, over }) {
      const load = active.data.current?.load as LoadListItem | undefined;
      if (!over) return `Load ${load?.loadNumber ?? active.id} dropped — returned to original position.`;
      const transition = getTransition(load?.status ?? '', over.id as string);
      if (transition) {
        return `Load ${load?.loadNumber ?? active.id} — ${transition.label.replace('Drop to ', '')}.`;
      }
      return `Load ${load?.loadNumber ?? active.id} returned to original position.`;
    },
    onDragCancel({ active }) {
      const load = active.data.current?.load as LoadListItem | undefined;
      return `Drag cancelled. Load ${load?.loadNumber ?? active.id} returned to original position.`;
    },
  },
};
