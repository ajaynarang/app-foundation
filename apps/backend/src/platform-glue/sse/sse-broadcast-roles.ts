import { UserRole } from '@appshore/db';

/**
 * How each role is reached on the SSE stream (`SseService`).
 *
 * - `broadcast`: receives tenant-wide events (`emitToTenant`): the workspace's own view of its data.
 * - `direct-only`: receives only the events addressed to that user (`emitToUser`).
 *
 * Every `UserRole` value must be classified (`sse-role-fanout.spec.ts`). A product that adds a guest, customer or
 * driver role decides here, before its first connection, whether that role may see every tenant broadcast.
 */
export const SSE_ROLE_FANOUT: Record<UserRole, 'broadcast' | 'direct-only'> = {
  [UserRole.OWNER]: 'broadcast',
  [UserRole.ADMIN]: 'broadcast',
  [UserRole.MEMBER]: 'broadcast',
  [UserRole.SUPER_ADMIN]: 'broadcast',
};

/** The roles bound to `SSE_TENANT_BROADCAST_ROLES`. */
export const SSE_BROADCAST_ROLES: readonly UserRole[] = (Object.keys(SSE_ROLE_FANOUT) as UserRole[]).filter(
  (role) => SSE_ROLE_FANOUT[role] === 'broadcast',
);
