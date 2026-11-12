/**
 * Which knowledge-base audiences a caller may search. Decided by the server from who is calling, never by the model:
 * the search tools take no `audience` argument.
 *
 * Every signed-in caller sees `all`. A product that writes content for one role adds that role here
 * (`ROLE_AUDIENCE`, e.g. `ADMIN: 'admin'`), tags the files `audience: admin`, and those callers then see `all` plus
 * their own audience. The content loader accepts only the audiences this file names, so a file can never be tagged
 * for an audience nobody can retrieve.
 *
 * Used by the `search-kb` and `get-product-info` tools and by `pnpm kb:eval`, so the golden set is scored under the
 * same rule production runs.
 */
export const KB_AUDIENCE = {
  ALL: 'all',
} as const;

/**
 * Workspace role (`OWNER`, `ADMIN`, `MEMBER`, ...) to the extra audience it may read. Empty in the starter: every
 * caller reads `all` only.
 */
export const ROLE_AUDIENCE: Readonly<Record<string, string>> = {};

/** Every audience a content file may carry. */
export function knownKbAudiences(): string[] {
  return [...new Set<string>([KB_AUDIENCE.ALL, ...Object.values(ROLE_AUDIENCE)])];
}

/** The audiences a caller may search: `all`, plus its role's own audience when the role has one. */
export function kbAudiencesFor(role: string | undefined | null): string[] {
  const own = typeof role === 'string' ? ROLE_AUDIENCE[role.toUpperCase()] : undefined;
  return own && own !== KB_AUDIENCE.ALL ? [KB_AUDIENCE.ALL, own] : [KB_AUDIENCE.ALL];
}

/**
 * The caller's role from the server-injected tool arguments (`_role`, set by the tool pipeline beside `_tenantId`).
 * Never a model argument: the tools' schemas have no audience or role field.
 */
export function kbRoleFromToolArgs(args: { _role?: unknown }): string | undefined {
  return typeof args._role === 'string' && args._role.length > 0 ? args._role : undefined;
}
