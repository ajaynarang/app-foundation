import { DeliveryChannel, type NotificationCategory } from '@appshore/db';
import { type NotificationType } from '@app/shared-types';

/**
 * What a channel does for a type when nothing else intervenes. Each layer below
 * the policy (the default, stored preference, quiet hours, consent) may only
 * narrow it — never widen it.
 */
export const CHANNEL_RULES = {
  /** Sent; the user's preference is ignored. In-app on critical types. */
  ALWAYS: 'always',
  /** Sent unless the user opted out. */
  DEFAULT: 'default',
  /** Not sent unless the user opted in. */
  OPT_IN: 'optIn',
  /** Sent only when no primary channel reached the recipient (and the user has not opted out). */
  FALLBACK: 'fallback',
  /** Not offered; a stored preference cannot turn it on. */
  NEVER: 'never',
} as const;
export type ChannelRule = (typeof CHANNEL_RULES)[keyof typeof CHANNEL_RULES];

export const NOTIFICATION_URGENCIES = {
  /** Pierces quiet hours. "Your match is in 60 minutes" is worthless at 9am. */
  CRITICAL: 'critical',
  TIMELY: 'timely',
  INFORMATIONAL: 'informational',
} as const;
export type NotificationUrgency = (typeof NOTIFICATION_URGENCIES)[keyof typeof NOTIFICATION_URGENCIES];

export interface NotificationPolicy {
  category: NotificationCategory;
  urgency: NotificationUrgency;
  channels: Record<DeliveryChannel, ChannelRule>;
  /** What a collapsed in-app group reads as — "3 match results", not "3 notifications". */
  groupLabel?: string;
}

/**
 * Policies keyed by notification type. Types are strings (platform list in `@app/shared-types` plus the app's own),
 * so this map is string-keyed; the app's own map stays exhaustive at compile time by typing it over the union of the
 * two `as const` lists (see the app's `platform-glue/notifications/notification-types.ts`).
 */
export type NotificationPolicyMap = Partial<Record<NotificationType, NotificationPolicy>>;

/** DI token an app binds its own policy map to. The platform's map is merged in by the registry. */
export const NOTIFICATION_POLICIES = 'APPSHORE_NOTIFICATION_POLICIES';

/**
 * DI token an app binds its declared notification types to (a `readonly string[]`, its `as const` list). The
 * registry refuses to boot when a declared type (platform or app) has no policy, or a policy names an undeclared type.
 */
export const NOTIFICATION_TYPES = 'APPSHORE_NOTIFICATION_TYPES';

/** The key each channel uses in UserPreferences.notificationPreferences[category]. */
export const CHANNEL_PREF_KEYS = {
  [DeliveryChannel.IN_APP]: 'inApp',
  [DeliveryChannel.PUSH]: 'push',
  [DeliveryChannel.EMAIL]: 'email',
  [DeliveryChannel.SMS]: 'sms',
  [DeliveryChannel.WHATSAPP]: 'whatsapp',
} as const satisfies Record<DeliveryChannel, string>;
export type ChannelPrefKey = (typeof CHANNEL_PREF_KEYS)[DeliveryChannel];

export interface PolicyOptions {
  inApp?: ChannelRule;
  push?: ChannelRule;
  email?: ChannelRule;
  sms?: ChannelRule;
  whatsapp?: ChannelRule;
  /** What a collapsed in-app group reads as. */
  groupLabel?: string;
}

/** In-app and push are on unless said otherwise; the billed channels are off unless said otherwise. */
export const policy = (
  category: NotificationCategory,
  urgency: NotificationUrgency,
  { groupLabel, ...rules }: PolicyOptions,
): NotificationPolicy => ({
  category,
  urgency,
  ...(groupLabel ? { groupLabel } : {}),
  channels: {
    [DeliveryChannel.IN_APP]: rules.inApp ?? CHANNEL_RULES.DEFAULT,
    [DeliveryChannel.PUSH]: rules.push ?? CHANNEL_RULES.DEFAULT,
    [DeliveryChannel.EMAIL]: rules.email ?? CHANNEL_RULES.NEVER,
    [DeliveryChannel.SMS]: rules.sms ?? CHANNEL_RULES.NEVER,
    [DeliveryChannel.WHATSAPP]: rules.whatsapp ?? CHANNEL_RULES.NEVER,
  },
});
