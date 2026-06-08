import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIntegrationHealth, syncFleet, syncLoads, syncHOS, syncTelematics, syncELD } from '../api';
import { showError, showSuccessWithLink } from '@sally/ui';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export const INTEGRATION_HEALTH_KEY = queryKeys.integrationHealth.root;

/**
 * Core health query with dynamic polling interval.
 * Default: 30s. When a sync is active: 3s (set via `pollingOverride`).
 */
export function useIntegrationHealth(pollingOverride?: number) {
  return useQuery({
    queryKey: INTEGRATION_HEALTH_KEY,
    queryFn: getIntegrationHealth,
    staleTime: QUERY_TIERS.ACTIVE_POLL.staleTime,
    refetchInterval: pollingOverride ?? QUERY_TIERS.ACTIVE_POLL.refetchInterval,
  });
}

/**
 * Manages sync lifecycle: trigger → poll fast → detect completion → callback → restore.
 *
 * Supports parallel syncs (HOS + telematics can run concurrently).
 * Fleet/loads block each other. HOS and telematics are independent.
 */
export function useSyncActions(opts?: {
  onSyncFleetComplete?: () => void;
  onSyncLoadsComplete?: () => void;
  onSyncHOSComplete?: () => void;
  onSyncTelematicsComplete?: () => void;
  onSyncELDComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeSyncs, setActiveSyncs] = useState<Set<string>>(new Set());
  const [pollingInterval, setPollingInterval] = useState(30000);
  const hadActiveSyncs = useRef(false);

  const isSyncing = activeSyncs.size > 0;

  // Watch health data for sync completion
  const { data: health } = useIntegrationHealth(pollingInterval);
  const hasSyncsRunning = (health?.activeSyncs?.length ?? 0) > 0;

  useEffect(() => {
    if (activeSyncs.size === 0) return;

    if (hasSyncsRunning) {
      hadActiveSyncs.current = true;
    }

    // Completion: we had syncs running, now they're done
    if (hadActiveSyncs.current && !hasSyncsRunning) {
      const completedSyncs = new Set(activeSyncs);
      setActiveSyncs(new Set());
      setPollingInterval(30000);
      hadActiveSyncs.current = false;

      queryClient.invalidateQueries({ queryKey: INTEGRATION_HEALTH_KEY });
      queryClient.invalidateQueries({ queryKey: ['unified-sync-history'] });

      if (completedSyncs.has('fleet')) opts?.onSyncFleetComplete?.();
      if (completedSyncs.has('loads')) opts?.onSyncLoadsComplete?.();
      if (completedSyncs.has('hos')) opts?.onSyncHOSComplete?.();
      if (completedSyncs.has('gps')) opts?.onSyncTelematicsComplete?.();
      if (completedSyncs.has('eld')) opts?.onSyncELDComplete?.();
    }
  }, [hasSyncsRunning, activeSyncs, queryClient, opts]);

  // Timeout fallback: if sync takes too long (60s), stop fast polling
  useEffect(() => {
    if (activeSyncs.size === 0) return;

    const timeout = setTimeout(() => {
      if (activeSyncs.size > 0) {
        const completedSyncs = new Set(activeSyncs);
        setActiveSyncs(new Set());
        setPollingInterval(30000);
        hadActiveSyncs.current = false;

        queryClient.invalidateQueries({ queryKey: ['unified-sync-history'] });

        if (completedSyncs.has('fleet')) opts?.onSyncFleetComplete?.();
        if (completedSyncs.has('loads')) opts?.onSyncLoadsComplete?.();
        if (completedSyncs.has('hos')) opts?.onSyncHOSComplete?.();
        if (completedSyncs.has('gps')) opts?.onSyncTelematicsComplete?.();
        if (completedSyncs.has('eld')) opts?.onSyncELDComplete?.();
      }
    }, 60000);

    return () => clearTimeout(timeout);
  }, [activeSyncs, opts, queryClient]);

  const startSync = useCallback(
    (type: string) => {
      setActiveSyncs((prev) => new Set(prev).add(type));
      setPollingInterval(3000);
      hadActiveSyncs.current = false;
      queryClient.invalidateQueries({ queryKey: INTEGRATION_HEALTH_KEY });
      // Invalidate sync history after a short delay to catch fast-completing syncs
      // (mock syncs finish in milliseconds, before the next health poll)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: INTEGRATION_HEALTH_KEY });
        queryClient.invalidateQueries({ queryKey: ['unified-sync-history'] });
      }, 2000);
    },
    [queryClient],
  );

  const syncFleetMutation = useMutation({
    mutationFn: syncFleet,
    onSuccess: (data) => {
      startSync('fleet');
      showSuccessWithLink(
        'Fleet sync started',
        'View in System Activity',
        '/settings/system-activity?category=tms',
        data.jobIds?.[0],
      );
    },
    onError: (error: Error) => {
      showError('Sync failed', extractErrorMessage(error));
    },
  });

  const syncLoadsMutation = useMutation({
    mutationFn: syncLoads,
    onSuccess: (data) => {
      startSync('loads');
      showSuccessWithLink(
        'Loads sync started',
        'View in System Activity',
        '/settings/system-activity?category=tms',
        data.jobIds?.[0],
      );
    },
    onError: (error: Error) => {
      showError('Sync failed', extractErrorMessage(error));
    },
  });

  const syncHOSMutation = useMutation({
    mutationFn: syncHOS,
    onSuccess: (data) => {
      startSync('hos');
      showSuccessWithLink(
        'HOS sync started',
        'View in System Activity',
        '/settings/system-activity?category=eld',
        data.jobIds?.[0],
      );
    },
    onError: (error: Error) => {
      showError('Sync failed', extractErrorMessage(error));
    },
  });

  const syncTelematicsMutation = useMutation({
    mutationFn: syncTelematics,
    onSuccess: (data) => {
      startSync('gps');
      showSuccessWithLink(
        'GPS sync started',
        'View in System Activity',
        '/settings/system-activity?category=eld',
        data.jobIds?.[0],
      );
    },
    onError: (error: Error) => {
      showError('Sync failed', extractErrorMessage(error));
    },
  });

  const syncELDMutation = useMutation({
    mutationFn: syncELD,
    onSuccess: (data) => {
      startSync('eld');
      showSuccessWithLink(
        'ELD sync started',
        'View in System Activity',
        '/settings/system-activity?category=eld',
        data.jobIds?.[0],
      );
    },
    onError: (error: Error) => {
      showError('Sync failed', extractErrorMessage(error));
    },
  });

  // Concurrency checks
  const isFleetSyncing = activeSyncs.has('fleet') || activeSyncs.has('loads');
  const isELDSyncing = activeSyncs.has('eld');

  return {
    isSyncing,
    activeSyncs,
    pollingInterval,
    // Fleet operations (block each other)
    syncFleet: syncFleetMutation,
    syncLoads: syncLoadsMutation,
    isFleetBlocked: isFleetSyncing,
    // ELD operations (independent of fleet, HOS and telematics don't block each other)
    syncHOS: syncHOSMutation,
    syncTelematics: syncTelematicsMutation,
    syncELD: syncELDMutation,
    isHOSBlocked: activeSyncs.has('hos') || isELDSyncing,
    isTelematicsBlocked: activeSyncs.has('gps') || isELDSyncing,
    isELDBlocked: isELDSyncing || activeSyncs.has('hos') || activeSyncs.has('gps'),
  };
}
