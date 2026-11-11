import { Injectable } from '@nestjs/common';
import type { Prisma } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import type {
  AgentActivityFilter,
  AgentActivityPage,
  AgentActivityRow,
  AgentPrincipalKind,
  AgentScope,
} from '@app/shared-types';

/** Newest first; the row id is a UUID (never an Int key), so it is a safe tiebreak. */
const ACTIVITY_KEYSET = { field: 'createdAt', idField: 'id', kind: 'date', direction: 'desc' } as const;

export interface AgentActivityListParams {
  tenantId: number;
  principalKind: AgentPrincipalKind;
  principalId: string;
  filter: AgentActivityFilter;
  cursor?: string | null;
  limit?: number;
  /** Inclusive lower bound, YYYY-MM-DD in tenant local time. */
  dateFrom?: string | null;
  /** Inclusive upper bound, YYYY-MM-DD in tenant local time. */
  dateTo?: string | null;
}

/**
 * Read-only activity projection over AgentInvocationLog.
 *
 * Strict projection at the service boundary — argsRaw, piiReadFlag, tenantId and
 * requestId are NEVER returned, even if they are present on the DB row. The
 * frontend receives only the small safe shape declared in
 * `AgentActivityRowSchema`.
 */
@Injectable()
export class AgentActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One principal's invocations, newest first, as a cursor list. The cursor is the last row's
   * (createdAt, id): a createdAt alone would drop every other row written in that millisecond.
   */
  async list(params: AgentActivityListParams): Promise<AgentActivityPage> {
    const take = clampCursorLimit(params.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = params.cursor ? keysetWhere({ ...ACTIVITY_KEYSET, cursor: params.cursor }) : undefined;

    // The audit-log column stores `principal_id` with a kind-specific prefix
    // ("oauth:<clientId>", "apikey:<uuid>", "user:<userDbId>") so principals
    // are unambiguous across kinds. Frontend callers pass the bare id —
    // normalize here so the UI doesn't have to know about the prefix scheme.
    const principalIdQuery = this.canonicalPrincipalId(params.principalKind, params.principalId);

    const where: Prisma.AgentInvocationLogWhereInput = {
      tenantId: params.tenantId,
      principalKind: params.principalKind,
      principalId: principalIdQuery,
    };
    if (params.filter === 'approvals') {
      where.confirmationTokenId = { not: null };
    } else if (params.filter === 'tool_calls') {
      where.confirmationTokenId = null;
    }

    // Date range. `dateFrom` is inclusive at 00:00, `dateTo` is inclusive through 23:59:59.999 of that day.
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: new Date(`${params.dateFrom}T00:00:00.000Z`) } : {}),
        ...(params.dateTo ? { lte: new Date(`${params.dateTo}T23:59:59.999Z`) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.agentInvocationLog.findMany({
        where: keyset ? { AND: [where, keyset] } : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1, // the probe row says whether a next page exists
      }),
      this.prisma.agentInvocationLog.count({ where }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.id));
    return { items: page.items.map(this.project), nextCursor: page.nextCursor, total };
  }

  /**
   * Convert a UI-supplied bare id to the canonical audit-log form.
   * Idempotent: passing an already-prefixed value returns it unchanged so
   * older callers keep working.
   */
  private canonicalPrincipalId(kind: AgentPrincipalKind, id: string): string {
    const expectedPrefix =
      kind === 'oauth_client'
        ? 'oauth:'
        : kind === 'api_key'
          ? 'apikey:'
          : kind === 'user'
            ? 'user:'
            : kind === 'desk_responsibility'
              ? 'desk:'
              : '';
    if (!expectedPrefix) return id;
    return id.startsWith(expectedPrefix) ? id : `${expectedPrefix}${id}`;
  }

  // Explicit projection — NOT a spread. Guarantees argsRaw/piiReadFlag never leak.
  private project = (r: {
    id: string;
    principalKind: string;
    principalId: string;
    principalLabel: string;
    toolName: string;
    scopeRequired: string;
    hitlTier: string;
    argsDigest: string;
    argsRedacted: unknown;
    success: boolean;
    durationMs: number | null;
    error: string | null;
    outputSummary: string | null;
    confirmationTokenId: string | null;
    langfuseTraceId: string | null;
    createdAt: Date;
  }): AgentActivityRow => ({
    id: r.id,
    principalKind: r.principalKind as AgentPrincipalKind,
    principalId: r.principalId,
    principalLabel: r.principalLabel,
    toolName: r.toolName,
    scopeRequired: r.scopeRequired as AgentScope,
    hitlTier: r.hitlTier as AgentActivityRow['hitlTier'],
    argsDigest: r.argsDigest,
    argsRedacted: (r.argsRedacted ?? {}) as Record<string, unknown>,
    success: r.success,
    durationMs: r.durationMs,
    error: r.error,
    outputSummary: r.outputSummary,
    confirmationTokenId: r.confirmationTokenId,
    langfuseTraceId: r.langfuseTraceId,
    createdAt: r.createdAt.toISOString(),
    // argsRaw, piiReadFlag, tenantId, requestId are intentionally never projected.
  });
}
