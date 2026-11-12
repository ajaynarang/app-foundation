import { Prisma } from '@appshore/db';
import type { AiPayer } from '@app/shared-types';

/** The `credentialType` prefix of the platform's own routes (`PLATFORM_OPENROUTER`, `PLATFORM_COHERE`, ...). */
export const PLATFORM_CREDENTIAL_TYPE_PREFIX = 'PLATFORM_';

/**
 * Who paid for a ledger row, as SQL over `ai_invocations`: the platform paid when `credential_type` is null or starts
 * with `PLATFORM_`. Null covers every row written before routing, when only the platform could pay, and calls with no
 * route (voice). A workspace's own credential type means the workspace paid.
 *
 * The one statement of the rule: the budget's spend sum (`AiTelemetryService`), the admin spend reads and the
 * `vw_ai_cost_*` views (migration `ai_cost_cache_write_and_payer`) all use it. The AI budget caps count platform-paid
 * rows only, so a workspace never hits the platform's cap with money it spent on its own key.
 *
 * Use with an alias-free `ai_invocations` (or pass the alias): `PLATFORM_PAID_SQL` / `platformPaidSql('ai')`.
 */
export function platformPaidSql(alias?: string): Prisma.Sql {
  const column = Prisma.raw(alias ? `${alias}.credential_type` : 'credential_type');
  return Prisma.sql`(${column} IS NULL OR ${column} LIKE ${`${PLATFORM_CREDENTIAL_TYPE_PREFIX.replace('_', '\\_')}%`})`;
}

export const PLATFORM_PAID_SQL = platformPaidSql();

/** The same rule in code, for one row. */
export function payerOf(credentialType: string | null | undefined): AiPayer {
  return !credentialType || credentialType.startsWith(PLATFORM_CREDENTIAL_TYPE_PREFIX) ? 'PLATFORM' : 'TENANT';
}
