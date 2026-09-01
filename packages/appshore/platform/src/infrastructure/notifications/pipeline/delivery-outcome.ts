import { DeliveryChannel, DeliveryStatus } from '@appshore/db';

/**
 * Why a channel did not reach someone. A string column, not an enum: every
 * provider adds its own quirk and a Postgres enum cannot drop a value once added.
 */
export const DELIVERY_SKIP_REASONS = {
  NO_ADDRESS: 'NO_ADDRESS',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  NO_DEVICE: 'NO_DEVICE',
  /** No WhatsApp template maps this NotificationType (E95-2). */
  NO_TEMPLATE: 'NO_TEMPLATE',
  /** The platform kill switch is off (E95-2). */
  FLAG_OFF: 'FLAG_OFF',
  /** The club's plan does not include WhatsApp (E95-3). */
  NOT_ENTITLED: 'NOT_ENTITLED',
  /** The platform's daily send ceiling was reached (E95-3). */
  CEILING: 'CEILING',
  /** Stranded QUEUED: the job never ran, or the provider never called back (E95-5 sweep). */
  QUEUE_LOST: 'QUEUE_LOST',
  /** Meta's unpublished per-user marketing cap (error 131049) — never retried (E95-4). */
  MARKETING_CAP: 'MARKETING_CAP',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  DROPPED_TEST_MARKER: 'DROPPED_TEST_MARKER',
  /** The type's policy does not offer this channel. */
  POLICY_NEVER: 'POLICY_NEVER',
  /** The user (or their role default) has this channel off for the category. */
  USER_OPT_OUT: 'USER_OPT_OUT',
  /** WhatsApp without the consent kind this type needs. */
  NO_CONSENT: 'NO_CONSENT',
  /** Inside the user's quiet window and the type is not critical. */
  QUIET_HOURS: 'QUIET_HOURS',
  /** A fallback channel that was not needed: a primary channel reached the recipient. */
  PRIMARY_REACHED: 'PRIMARY_REACHED',
} as const;

export type DeliverySkipReason = (typeof DELIVERY_SKIP_REASONS)[keyof typeof DELIVERY_SKIP_REASONS];

export interface ChannelOutcome {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  failureReason?: DeliverySkipReason;
  /** Pre-generated when the send happens later on a queue — the job carries this id. */
  deliveryId?: string;
}

export const sent = (channel: DeliveryChannel): ChannelOutcome => ({ channel, status: DeliveryStatus.SENT });

export const queued = (channel: DeliveryChannel, deliveryId: string): ChannelOutcome => ({
  channel,
  status: DeliveryStatus.QUEUED,
  deliveryId,
});

export const failed = (channel: DeliveryChannel, failureReason: DeliverySkipReason): ChannelOutcome => ({
  channel,
  status: DeliveryStatus.FAILED,
  failureReason,
});

export const skipped = (channel: DeliveryChannel, failureReason: DeliverySkipReason): ChannelOutcome => ({
  channel,
  status: DeliveryStatus.SKIPPED,
  failureReason,
});
