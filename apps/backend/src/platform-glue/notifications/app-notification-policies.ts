import type { NotificationPolicy } from '@appshore/platform/infrastructure/notifications/notification-policy';
import type { WhatsAppTemplate } from '@appshore/platform/infrastructure/notifications/channels/whatsapp/whatsapp-template.registry';
import type { AppNotificationType, KnownNotificationType } from './notification-types';

/**
 * Your notification types' policies (category, urgency, channel rules), bound to NOTIFICATION_POLICIES in
 * `platform-glue/hooks.module.ts`. Typed over the app's `as const` list, so a declared app type without a policy does
 * not compile; a platform type may be re-declared here to change how it behaves for your users. See
 * `@appshore/platform/infrastructure/notifications/platform-notification-policies.ts` for the shape.
 */
export const APP_NOTIFICATION_POLICIES: Record<AppNotificationType, NotificationPolicy> &
  Partial<Record<KnownNotificationType, NotificationPolicy>> = {};

/** Your Meta-approved WhatsApp templates, keyed by notification type. Empty = no type sends on WhatsApp. */
export const APP_WHATSAPP_TEMPLATES: Partial<Record<KnownNotificationType, WhatsAppTemplate>> = {};
