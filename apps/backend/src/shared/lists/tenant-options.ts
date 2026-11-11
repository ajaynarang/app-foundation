import type { Prisma } from '@appshore/db';
import type { CursorList } from '@app/shared-types';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { containsText } from '@appshore/kernel/shared/utils/list-query';
import type { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

/** One tenant in a filter picker. `id` is the numeric id the super-admin filters take (`?tenant_id=`). */
export interface TenantOption {
  id: number;
  tenantId: string;
  companyName: string;
}

export interface TenantOptionQuery {
  q?: string;
  limit?: number;
  cursor?: string;
}

/** By company name; a stored name may hold a tab, so the cursor carries it as text. */
const TENANT_OPTION_KEYSET = { field: 'companyName', idField: 'tenantId', kind: 'text', direction: 'asc' } as const;

/**
 * The tenants behind a filter picker: those matching `having` (for example "has feedback"), by company name,
 * as a cursor list. `q` searches the server (company name or public tenant id), so a picker never filters a
 * loaded page in the browser. The tiebreak is the public tenant id, never the Int key.
 */
export async function listTenantOptions(
  prisma: PrismaService,
  having: Prisma.TenantWhereInput,
  query: TenantOptionQuery = {},
): Promise<CursorList<TenantOption>> {
  const take = clampCursorLimit(query.limit);
  // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
  const keyset = query.cursor ? keysetWhere({ ...TENANT_OPTION_KEYSET, cursor: query.cursor }) : undefined;
  const scope: Prisma.TenantWhereInput = query.q
    ? { AND: [having, { OR: [{ companyName: containsText(query.q) }, { tenantId: containsText(query.q) }] }] }
    : having;
  const [rows, total] = await Promise.all([
    prisma.tenant.findMany({
      where: keyset ? { AND: [scope, keyset] } : scope,
      select: { id: true, tenantId: true, companyName: true },
      orderBy: [{ companyName: 'asc' }, { tenantId: 'asc' }],
      take: take + 1,
    }),
    prisma.tenant.count({ where: scope }),
  ]);
  return { ...buildCursorPage(rows, take, (row) => encodeCursor(row.companyName, row.tenantId)), total };
}
