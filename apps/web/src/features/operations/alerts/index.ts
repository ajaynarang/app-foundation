// API
export { alertsApi, listAlerts, acknowledgeAlert, resolveAlert } from './api';

export { alertAnalyticsApi } from './api-analytics';

// Types (and runtime enums for AlertPriority / AlertScope)
export { AlertPriority, AlertScope } from '@sally/shared-types';
export type {
  AlertStatus,
  AlertCategory,
  Alert,
  AlertNote,
  AlertStats,
  ListAlertsParams,
  GroupedAlert,
  SmartAlertStats,
  AlertBriefing,
  AlertBriefingSituation,
} from './types';

// Hooks
export {
  useAlerts,
  useAlertById,
  useAlertStats,
  useAcknowledgeAlert,
  useSnoozeAlert,
  useResolveAlert,
  useAddAlertNote,
  useBulkAcknowledge,
  useBulkResolve,
  useGroupedAlerts,
  useSmartAlertStats,
  useAlertBriefing,
} from './hooks/use-alerts';

export {
  useAlertVolume,
  useResponseTimeTrend,
  useResolutionRates,
  useTopAlertTypes,
  useAlertHistory,
} from './hooks/use-alert-analytics';
