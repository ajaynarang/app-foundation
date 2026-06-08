import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  AgentActivityFilter,
  AgentActivityPage,
  AgentActivityRow,
  AgentPrincipalKind,
  AgentScope,
} from '@app/shared-types';

const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export interface AgentActivityListParams {
  tenantId: number;
  principalKind: AgentPrincipalKind;
  principalId: string;
  filter: AgentActivityFilter;
  cursor: string | null;
  limit: number;
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

  async list(params: AgentActivityListParams): Promise<AgentActivityPage> {
    const requested = params.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(requested, MIN_LIMIT), MAX_LIMIT);

    // The audit-log column stores `principal_id` with a kind-specific prefix
    // ("oauth:<clientId>", "apikey:<uuid>", "user:<userDbId>") so principals
    // are unambiguous across kinds. Frontend callers pass the bare id —
    // normalize here so the UI doesn't have to know about the prefix scheme.
    const principalIdQuery = this.canonicalPrincipalId(params.principalKind, params.principalId);

    const where: Record<string, unknown> = {
      tenantId: params.tenantId,
      principalKind: params.principalKind,
      principalId: principalIdQuery,
    };
    if (params.filter === 'approvals') {
      where.confirmationTokenId = { not: null };
    } else if (params.filter === 'tool_calls') {
      where.confirmationTokenId = null;
    }

    // Date range. `dateFrom` is inclusive at 00:00, `dateTo` is inclusive
    // through 23:59:59.999 of that day. Cursor (if present) further narrows
    // the upper bound to support pagination within a window.
    const createdAt: Record<string, Date> = {};
    if (params.dateFrom) createdAt.gte = new Date(`${params.dateFrom}T00:00:00.000Z`);
    if (params.dateTo) createdAt.lte = new Date(`${params.dateTo}T23:59:59.999Z`);
    if (params.cursor) {
      const cursorDate = new Date(params.cursor);
      // Cursor wins when narrower than dateTo
      if (!createdAt.lt || cursorDate < createdAt.lt) createdAt.lt = cursorDate;
      delete createdAt.lte;
    }
    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt;
    }

    const rows = await this.prisma.agentInvocationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // +1 to detect "has next page"
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1].createdAt.toISOString() : null;

    return {
      rows: trimmed.map(this.project),
      nextCursor,
    };
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
