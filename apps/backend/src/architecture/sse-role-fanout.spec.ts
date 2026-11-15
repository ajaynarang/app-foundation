import { UserRole } from '@appshore/db';
import { SSE_BROADCAST_ROLES, SSE_ROLE_FANOUT } from '../platform-glue/sse/sse-broadcast-roles';

/**
 * Every role is classified for the SSE stream (design item 18). A tenant broadcast carries the workspace's view of
 * its data, so a role the product adds (a guest, a customer, a driver) fails here until someone decides whether it
 * is `broadcast` or `direct-only` in `platform-glue/sse/sse-broadcast-roles.ts`.
 */
describe('SSE fan-out by role', () => {
  it.each(Object.values(UserRole))('classifies %s as broadcast or direct-only', (role) => {
    expect(['broadcast', 'direct-only']).toContain(SSE_ROLE_FANOUT[role]);
  });

  it('classifies no role the enum does not have', () => {
    expect(Object.keys(SSE_ROLE_FANOUT).sort()).toEqual([...Object.values(UserRole)].sort());
  });

  it('binds exactly the broadcast roles', () => {
    expect([...SSE_BROADCAST_ROLES].sort()).toEqual(
      Object.values(UserRole)
        .filter((role) => SSE_ROLE_FANOUT[role] === 'broadcast')
        .sort(),
    );
  });
});
