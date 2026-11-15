import { DeliveryChannel } from '@appshore/db';
import { OUTBOUND_CHANNEL } from '@appshore/kernel/infrastructure/outbound/outbound-channel';

/**
 * The kernel cannot import the Prisma enum, so `OUTBOUND_CHANNEL` (the `app_outbound_failed{channel}` vocabulary and
 * the outbound gate's) is a hand-kept list. This holds it to the delivery ledger: every channel that leaves the
 * process has a value, so a new `DeliveryChannel` cannot be sent without a metric label for its failures.
 */
describe('OUTBOUND_CHANNEL parity with DeliveryChannel', () => {
  const outbound = new Set<string>(Object.values(OUTBOUND_CHANNEL));

  it.each(Object.values(DeliveryChannel).filter((channel) => channel !== DeliveryChannel.IN_APP))(
    'DeliveryChannel.%s has an OUTBOUND_CHANNEL value',
    (channel) => {
      expect(outbound.has(channel.toLowerCase())).toBe(true);
    },
  );

  it('IN_APP never leaves the process, so it has no outbound value', () => {
    expect(outbound.has(DeliveryChannel.IN_APP.toLowerCase())).toBe(false);
  });
});
