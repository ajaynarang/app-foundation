import type { AgentDetail } from '../types';

type UserRole = 'OWNER' | 'ADMIN' | 'DISPATCHER' | 'DRIVER' | 'CUSTOMER' | 'SUPER_ADMIN';

export interface PermissionsUser {
  dbId?: number;
  role: UserRole;
}

const BYPASS_ROLES: readonly UserRole[] = ['OWNER', 'ADMIN', 'SUPER_ADMIN'];

/**
 * Mirror of backend DeskAgentEditGuard — owner/admin can edit any agent,
 * dispatchers only the agents they supervise. The UI disables write
 * affordances when this returns false; backend still enforces regardless.
 */
export function canEditAgent(user: PermissionsUser | null | undefined, agent: AgentDetail | null | undefined): boolean {
  if (!user || !agent) return false;
  if (BYPASS_ROLES.includes(user.role)) return true;
  if (user.role !== 'DISPATCHER') return false;
  if (user.dbId == null || !agent.supervisor) return false;
  return agent.supervisor.id === user.dbId;
}

/**
 * Supervisor-reassignment is OWNER/ADMIN-only. The backend enforces this
 * inline on PATCH /desk/agents/:key.
 */
export function canReassignSupervisor(user: PermissionsUser | null | undefined): boolean {
  if (!user) return false;
  return BYPASS_ROLES.includes(user.role);
}

export function canPauseAgent(
  user: PermissionsUser | null | undefined,
  agent: AgentDetail | null | undefined,
): boolean {
  return canEditAgent(user, agent);
}

/**
 * The tenant-wide autonomous-run master switch is OWNER/ADMIN/SUPER_ADMIN
 * only — mirrors the @Roles guard on PATCH /desk/schedule. Dispatchers can
 * see the state but not flip it.
 */
export function canManageDeskSchedule(user: PermissionsUser | null | undefined): boolean {
  if (!user) return false;
  return BYPASS_ROLES.includes(user.role);
}
