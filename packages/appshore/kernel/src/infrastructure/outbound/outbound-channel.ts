/**
 * The closed set of outbound channels, one kernel constant shared by the `app_outbound_failed{channel}` metric and
 * the outbound gate. The kernel cannot import the Prisma `DeliveryChannel` enum, so a parity spec in platform
 * (`outbound-channel-parity.spec.ts`) asserts every `DeliveryChannel` value except `IN_APP` has a value here.
 * `webhook` has no ledger channel: customer webhooks are delivered by their own queue.
 */
export const OUTBOUND_CHANNEL = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  WHATSAPP: 'whatsapp',
  WEBHOOK: 'webhook',
} as const;

export type OutboundChannel = (typeof OUTBOUND_CHANNEL)[keyof typeof OUTBOUND_CHANNEL];
