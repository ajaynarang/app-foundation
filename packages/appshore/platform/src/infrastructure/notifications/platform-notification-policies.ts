import { NotificationCategory, NotificationType } from '@appshore/db';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy, type NotificationPolicyMap } from './notification-policy';

const { DEFAULT, OPT_IN, NEVER } = CHANNEL_RULES;
const { TIMELY, INFORMATIONAL } = NOTIFICATION_URGENCIES;

/** The foundation's own types. Every AppShore app ships these; an app adds its own map on top. */
export const PLATFORM_NOTIFICATION_POLICIES: NotificationPolicyMap = {
  [NotificationType.USER_INVITATION]: policy(NotificationCategory.TEAM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'invitations sent',
  }),
  [NotificationType.TENANT_REGISTRATION_CONFIRMATION]: policy(NotificationCategory.SYSTEM, TIMELY, { email: DEFAULT }),
  [NotificationType.TENANT_APPROVED]: policy(NotificationCategory.SYSTEM, TIMELY, { email: DEFAULT }),
  [NotificationType.TENANT_REJECTED]: policy(NotificationCategory.SYSTEM, TIMELY, { email: DEFAULT }),
  [NotificationType.INTEGRATION_SYNC_COMPLETED]: policy(NotificationCategory.SYSTEM, INFORMATIONAL, {
    push: NEVER,
    email: OPT_IN,
    groupLabel: 'syncs completed',
  }),
  [NotificationType.INTEGRATION_SYNC_FAILED]: policy(NotificationCategory.SYSTEM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'sync failures',
  }),
  [NotificationType.SETTINGS_UPDATED]: policy(NotificationCategory.SYSTEM, INFORMATIONAL, {
    push: NEVER,
    groupLabel: 'settings updates',
  }),
  [NotificationType.USER_JOINED]: policy(NotificationCategory.TEAM, INFORMATIONAL, {
    email: OPT_IN,
    groupLabel: 'users joined',
  }),
  [NotificationType.ROLE_CHANGED]: policy(NotificationCategory.TEAM, TIMELY, {
    email: DEFAULT,
    groupLabel: 'role changes',
  }),
};
