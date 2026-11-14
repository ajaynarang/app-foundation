import { OutboundAllowKind } from '@appshore/db';
import { OUTBOUND_ALLOW_KIND } from '@appshore/kernel/infrastructure/outbound/outbound-recipient';

/**
 * The kernel cannot import the Prisma enum, so `OUTBOUND_ALLOW_KIND` (what the gate matches on) mirrors
 * `OutboundAllowKind`. A kind added to one and not the other would be stored but never matched, or matched but
 * never storable.
 */
describe('OUTBOUND_ALLOW_KIND parity with OutboundAllowKind', () => {
  it('holds exactly the Prisma enum values', () => {
    expect(Object.values(OUTBOUND_ALLOW_KIND).sort()).toEqual(Object.values(OutboundAllowKind).sort());
  });
});
