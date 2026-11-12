/**
 * Which knowledge-base audiences a caller may search. Decided by the server from who is calling, never by the model:
 * the search tools take no `audience` argument.
 *
 * Every signed-in caller sees `all`. A product that writes content for one role adds that role here
 * (`ROLE_AUDIENCE`, e.g. `ADMIN: 'admin'`), tags the files `audience: admin`, and those callers then see `all` plus
 * their own audience. The content loader accepts only the audiences this file names.
 *
 * Not yet: keep `ROLE_AUDIENCE` empty and every file `audience: all` until the tool pipeline injects `_role` and
 * strips any `_`-prefixed key the model sends (a later change in this project). Today the tool runner and
 * `McpToolService` spread the model's arguments and add only `_tenantId`, `_userId` and `_userDbId` /
 * `_conversationId` on top, so no real `_role` arrives (files tagged for a role audience reach nobody) and a
 * `_role` the model or an external MCP agent sends passes straight through (it would read that role's audience).
 * With the map empty, `_role` changes nothing, which is why the starter is safe.
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
 * The caller's role from the server-injected tool arguments (`_role`, to be set by the tool pipeline beside
 * `_tenantId`). The tools' schemas have no audience or role field, but until that pipeline strips model-sent `_`
 * keys a `_role` here may come from the model; see the note above `KB_AUDIENCE`.
 */
export function kbRoleFromToolArgs(args: { _role?: unknown }): string | undefined {
  return typeof args._role === 'string' && args._role.length > 0 ? args._role : undefined;
}
