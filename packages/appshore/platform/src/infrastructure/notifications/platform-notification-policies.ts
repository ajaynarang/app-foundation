import { NotificationCategory } from '@appshore/db';
import { PlatformNotificationType } from '@app/shared-types';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy, type NotificationPolicy } from './notification-policy';

const { DEFAULT, OPT_IN, NEVER } = CHANNEL_RULES;
const { TIMELY, INFORMATIONAL } = NOTIFICATION_URGENCIES;

/**
 * The foundation's own types (PLATFORM_NOTIFICATION_TYPES). Every AppShore app ships these; an app adds its own map
 * on top. Typed over the platform list, so a platform type without a policy does not compile.
 */
export const PLATFORM_NOTIFICATION_POLICIES: Record<PlatformNotificationType, NotificationPolicy> = {
  [PlatformNotificationType.USER_INVITATION]: policy(NotificationCategory.TEAM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'invitations sent',
  }),
  [PlatformNotificationType.TENANT_REGISTRATION_CONFIRMATION]: policy(NotificationCategory.SYSTEM, TIMELY, {
    email: DEFAULT,
  }),
  [PlatformNotificationType.TENANT_APPROVED]: policy(NotificationCategory.SYSTEM, TIMELY, { email: DEFAULT }),
  [PlatformNotificationType.TENANT_REJECTED]: policy(NotificationCategory.SYSTEM, TIMELY, { email: DEFAULT }),
  [PlatformNotificationType.INTEGRATION_SYNC_COMPLETED]: policy(NotificationCategory.SYSTEM, INFORMATIONAL, {
    push: NEVER,
    email: OPT_IN,
    groupLabel: 'syncs completed',
  }),
  [PlatformNotificationType.INTEGRATION_SYNC_FAILED]: policy(NotificationCategory.SYSTEM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'sync failures',
  }),
  [PlatformNotificationType.SETTINGS_UPDATED]: policy(NotificationCategory.SYSTEM, INFORMATIONAL, {
    push: NEVER,
    groupLabel: 'settings updates',
  }),
  [PlatformNotificationType.AI_BUDGET_REACHED]: policy(NotificationCategory.SYSTEM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'AI budget alerts',
  }),
  [PlatformNotificationType.USER_JOINED]: policy(NotificationCategory.TEAM, INFORMATIONAL, {
    email: OPT_IN,
    groupLabel: 'users joined',
  }),
  [PlatformNotificationType.ROLE_CHANGED]: policy(NotificationCategory.TEAM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'role changes',
  }),
};
