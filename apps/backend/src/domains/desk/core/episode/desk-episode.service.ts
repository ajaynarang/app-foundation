import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeskEpisodeStatus, Prisma } from '@appshore/db';
import {
  HANDLED_EPISODE_STATUSES,
  NEEDS_YOU_EPISODE_STATUSES,
  type ApprovalDecision,
  type ApprovalRecord,
  type AgentKey,
  type DeskEpisodeDetail,
  type DeskEpisodeListItem,
  type EpisodeStatus,
  type GateDecisionRecord,
  type HandledListItem,
  type ListDeskEpisodesQuery,
  type ListDeskEpisodesResponse,
  type ListHandledEpisodesQuery,
  type ListHandledEpisodesResponse,
  type Priority,
  type ResponsibilityKey,
  type StepRecord,
} from '../types';
import { DateTime } from 'luxon';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { ApprovalEnrichmentService } from '../approval/approval-enrichment.service';

/**
 * Statuses shown on the Handled tab. Sourced from the shared view set so the
 * Handled list, the Handled count badge (approval.service), and the FE agree
 * on one definition of "ended and needs no human." ESCALATED is deliberately
 * excluded — an escalation is unfinished business that lives on Needs-you
 * until a human resolves it (ESCALATED → RESOLVED via resolveEpisode), at
 * which point the RESOLVED episode lands here. Dispatchers still see failures
 * and cancellations on Handled — the unit-of-attention is "the episode ended,"
 * not "the episode ended HAPPILY."
 */
const HANDLED_STATUSES: readonly DeskEpisodeStatus[] = [...HANDLED_EPISODE_STATUSES] as DeskEpisodeStatus[];

/** Statuses surfaced on the Needs-you tab — awaiting human attention. */
const NEEDS_YOU_STATUSES: readonly DeskEpisodeStatus[] = [...NEEDS_YOU_EPISODE_STATUSES] as DeskEpisodeStatus[];

const EPISODE_STATUS = DeskEpisodeStatus;

/**
 * Read-only projection of desk_episodes + child tables for the UI.
 *
 * Cursor pagination uses `${openedAt.toISOString()}|${id}` so ties on
 * openedAt (rare but possible at seed time) are broken by id — stable
 * across paging.
 */
@Injectable()
export class DeskEpisodeService {
  private readonly logger = new Logger(DeskEpisodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalEnrichment: ApprovalEnrichmentService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Resolve an escalated episode — the operator's exit for an escalation.
   *
   * State machine: only ESCALATED → RESOLVED is allowed via this path. An
   * escalation is a closed-but-unfinished episode that lives on Needs-you;
   * resolving it moves it to Handled. We do NOT touch `closedAt` — the
   * escalation already set it; resolving is the human signing off, not a new
   * close. The optional note is appended to `outcomeNote` so the Handled-tab
   * history records why the human cleared it.
   *
   * Emits `DESK_EPISODE_CHANGED` so the Needs-you + Handled lists and the
   * handoff counts refresh live (SSE) without a page reload.
   */
  async resolveEpisode(
    tenantId: number,
    episodeId: string,
    userId: number,
    note?: string,
  ): Promise<{ id: string; status: DeskEpisodeStatus }> {
    const episode = await this.prisma.deskEpisode.findFirst({
      where: { id: episodeId, tenantId },
      select: { id: true, status: true, outcomeNote: true },
    });
    if (!episode) throw new NotFoundException('Episode not found');
    if (episode.status !== EPISODE_STATUS.ESCALATED) {
      throw new BadRequestException('Only an escalated episode can be resolved');
    }

    const trimmedNote = note?.trim();
    const outcomeNote = trimmedNote
      ? episode.outcomeNote
        ? `${episode.outcomeNote}\n\n${trimmedNote}`
        : trimmedNote
      : episode.outcomeNote;

    const updated = await this.prisma.deskEpisode.update({
      where: { id: episode.id },
      data: { status: EPISODE_STATUS.RESOLVED, outcomeNote },
      select: { id: true, status: true },
    });

    await this.events.emit(
      DOMAIN_EVENTS.DESK_EPISODE_CHANGED,
      tenantId,
      { tenantId, episodeId: updated.id, status: updated.status },
      { id: String(userId), type: 'user' },
    );

    this.logger.log(`desk-episode-resolved episodeId=${updated.id} tenant=${tenantId} byUser=${userId}`);
    return updated;
  }

  async listForTenant(
    tenantId: number,
    query: ListDeskEpisodesQuery,
    context: { currentUserId?: number } = {},
  ): Promise<ListDeskEpisodesResponse> {
    const limit = query.limit;
    const cursor = parseCursor(query.cursor);

    // Mine-scope narrows by the owner-agent's supervisor. Missing user → empty.
    const scopeWhere =
      query.scope === 'mine'
        ? context.currentUserId
          ? { ownerAgent: { supervisorUserId: context.currentUserId } }
          : { id: '__no_match__' } // forces empty rows
        : {};

    const rows = await this.prisma.deskEpisode.findMany({
      where: {
        tenantId,
        // Explicit status filter (e.g. the "Escalated" chip passes
        // status=ESCALATED) wins. With no filter, default to the Needs-you
        // set so handled/terminal episodes never leak into the Needs-you list
        // — the fix for an escalated episode showing on both tabs.
        ...(query.status ? { status: query.status } : { status: { in: [...NEEDS_YOU_STATUSES] } }),
        ...scopeWhere,
        ...(cursor
          ? {
              OR: [{ openedAt: { lt: cursor.openedAt } }, { openedAt: cursor.openedAt, id: { lt: cursor.id } }],
            }
          : {}),
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        responsibility: { select: { key: true } },
        ownerAgent: { select: { key: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? formatCursor(last.openedAt, last.id) : null;

    return {
      rows: page.map(toListItem),
      nextCursor,
    };
  }

  async getForTenant(tenantId: number, episodeId: string): Promise<DeskEpisodeDetail> {
    const row = await this.prisma.deskEpisode.findFirst({
      where: { id: episodeId, tenantId },
      include: {
        responsibility: { select: { key: true, title: true } },
        ownerAgent: { select: { key: true, name: true } },
        steps: {
          orderBy: { sequence: 'asc' },
          // Token counts + USD cost now live on the AiInvocation ledger
          // (the inline columns were dropped in PR 12); pull them via the FK
          // so the step timeline keeps rendering per-step cost.
          include: { aiInvocation: { select: { promptTokens: true, completionTokens: true, costUsd: true } } },
        },
        approvals: { orderBy: { requestedAt: 'asc' } },
        // Active entity-suppression scoped by the `sourceEpisodeId` back-relation.
        // TODO: this only surfaces suppressions whose SOURCE was this very episode.
        // A suppression set by a DIFFERENT episode on the same
        // (tenant, responsibility, entity) tuple would not surface here. In
        // practice this is fine — snooze closes the source episode and blocks
        // new episodes on the same entity, so a later Handled row for the same
        // entity is rare. Widen to a tuple join when that rare case bites.
        entitySuppressions: {
          where: {
            unsuppressedAt: null,
            OR: [{ suppressUntil: null }, { suppressUntil: { gt: new Date() } }],
          },
          select: { id: true, suppressUntil: true },
          take: 1,
          orderBy: { setAt: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Episode not found');

    const responsibilityKey = row.responsibility.key;
    const stepsLite = row.steps.map((s) => ({
      kind: s.kind,
      sequence: s.sequence,
      output: (s.output as Record<string, unknown> | null) ?? null,
    }));

    const approvals: ApprovalRecord[] = row.approvals.map((a) => ({
      ...toApprovalRecord(a),
      ...this.approvalEnrichment.enrich({
        responsibilityKey,
        proposedAction: (a.proposedAction as Record<string, unknown>) ?? {},
        steps: stepsLite,
      }),
    }));

    // Pick the most-recent decided approval in-memory — no extra query.
    // Used by the Handled-mode sheet to render the decision diff (proposed
    // vs edited) and the human-decision pill without re-scanning the array.
    const mostRecentDecidedApproval = pickMostRecentDecidedApproval(approvals);

    const suppressionRow = (row as { entitySuppressions?: Array<{ id: string; suppressUntil: Date | null }> })
      .entitySuppressions?.[0];
    const activeSuppression = suppressionRow
      ? { id: suppressionRow.id, suppressUntil: suppressionRow.suppressUntil?.toISOString() ?? null }
      : null;

    return {
      ...toListItem(row),
      // Human-facing agent name — the sheet's title row renders this so
      // operators in a multi-agent future can see "Autumn · You · 8m ago"
      // instead of a machine key like welcome-bot. Null when the agent
      // row's name column is blank (legacy seed data).
      ownerAgentName: row.ownerAgent.name ?? null,
      // Human-facing responsibility title ("Nudge customers on overdue
      // invoices"). Framed above the entity in the sheet header so the
      // operator understands the WHY-of-this-episode before the WHAT.
      responsibilityTitle: row.responsibility.title,
      conditionsSnapshot: (row.conditionsSnapshot as Record<string, unknown>) ?? {},
      triggerSource: row.triggerSource,
      triggerPayload: (row.triggerPayload as Record<string, unknown>) ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      steps: row.steps.map(toStepRecord),
      approvals,
      mostRecentDecidedApproval,
      activeSuppression,
      // Surfaced to the UI's "Memories that influenced this episode" card.
      // Populated by hydrate.step (Slice A T7).
      retrievedMemoryIds: row.retrievedMemoryIds ?? [],
    };
  }

  /**
   * Handled tab list — terminal episodes in a tenant-local time window
   * with rich filters. Returns slim `HandledListItem` rows + a summary
   * rollup (total, byOutcome, autonomousPct). Pagination via `${closedAt.toISOString()}|${id}`
   * cursor.
   *
   * Window boundaries are tenant-local (Luxon + tenantTimezone). The
   * wire contract uses camelCase; Prisma where/select/include stays
   * snake_case-free where relations are camelCase in the schema.
   */
  async listHandled(
    tenantId: number,
    query: ListHandledEpisodesQuery,
    ctx: { currentUserId?: number; tenantTimezone: string },
  ): Promise<ListHandledEpisodesResponse> {
    const startedAtMs = Date.now();

    // Defensive: mine-scope with no user → empty rows, no DB round trip.
    // Keeps the list contract honest + prevents leaking tenant-wide rows.
    if (query.scope === 'mine' && !ctx.currentUserId) {
      return { rows: [], nextCursor: null, summary: { total: 0, byOutcome: {}, autonomousPct: 0 } };
    }

    const { from, to } = resolveWindow(query, ctx.tenantTimezone);
    const cursor = parseCursor(query.cursor);

    const ownerAgentScope: Prisma.DeskAgentWhereInput =
      query.scope === 'mine' && ctx.currentUserId ? { supervisorUserId: ctx.currentUserId } : {};
    if (query.agent) ownerAgentScope.key = query.agent;
    const ownerAgentWhere = Object.keys(ownerAgentScope).length > 0 ? { ownerAgent: ownerAgentScope } : {};

    const where: Prisma.DeskEpisodeWhereInput = {
      tenantId,
      status: { in: [...HANDLED_STATUSES] },
      closedAt: { gte: from, lte: to },
      ...ownerAgentWhere,
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.q
        ? {
            OR: [
              { entityLabel: { contains: query.q, mode: 'insensitive' } },
              { responsibility: { key: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(cursor
        ? {
            OR: [{ closedAt: { lt: cursor.openedAt } }, { closedAt: cursor.openedAt, id: { lt: cursor.id } }],
          }
        : {}),
    };

    const rows = await this.prisma.deskEpisode.findMany({
      where,
      orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        responsibility: { select: { key: true, title: true } },
        ownerAgent: { select: { key: true, name: true } },
        approvals: {
          where: { decision: { not: null } },
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: {
            decision: true,
            decidedByUserId: true,
            decidedBy: { select: { firstName: true, lastName: true } },
          },
        },
        // Active suppression via the `sourceEpisodeId` back-relation. See the
        // TODO in getForTenant — same simplification applies here: only
        // surfaces suppressions created FROM this episode. Acceptable because
        // snoozing closes the source episode and blocks later ones on the
        // same entity until the window elapses or the row is cleared.
        entitySuppressions: {
          where: {
            unsuppressedAt: null,
            OR: [{ suppressUntil: null }, { suppressUntil: { gt: new Date() } }],
          },
          select: { id: true, suppressUntil: true },
          take: 1,
          orderBy: { setAt: 'desc' },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last && last.closedAt ? formatCursor(last.closedAt, last.id) : null;

    const mapped = page.map((row) => toHandledListItem(row as HandledRow));
    const byOutcome: Record<string, number> = {};
    let autonomousCount = 0;
    for (const row of mapped) {
      byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
      if (row.humanDecision === null) autonomousCount++;
    }

    const durationMs = Date.now() - startedAtMs;
    this.logger.log(
      `desk-handled-list: tenant=${tenantId} scope=${query.scope ?? 'all'} window=${query.window ?? 'today'} rows=${mapped.length} ms=${durationMs}`,
    );

    return {
      rows: mapped,
      nextCursor,
      summary: {
        total: mapped.length,
        byOutcome,
        autonomousPct: mapped.length === 0 ? 0 : autonomousCount / mapped.length,
      },
    };
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────

interface EpisodeWithRels {
  id: string;
  tenantId: number;
  responsibility: { key: string };
  ownerAgent: { key: string };
  trustLevelSnapshot: 'SUPERVISED' | 'ASSISTED' | 'AUTONOMOUS';
  triggerKind: 'SCHEDULED' | 'DOMAIN_EVENT' | 'WEBHOOK' | 'MANUAL';
  triggerLabel: string;
  triggerFiredAt: Date;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  status: string;
  priority: string;
  dedupeKey: string;
  outcome: string | null;
  outcomeNote: string | null;
  workflowId: string;
  workflowRunId: string | null;
  openedAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

function toListItem(row: EpisodeWithRels): DeskEpisodeListItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    responsibilityKey: row.responsibility.key,
    ownerAgentKey: row.ownerAgent.key,
    trustLevelSnapshot: row.trustLevelSnapshot,
    triggerKind: row.triggerKind,
    triggerLabel: row.triggerLabel,
    triggerFiredAt: row.triggerFiredAt.toISOString(),
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    status: row.status as DeskEpisodeListItem['status'],
    priority: row.priority as DeskEpisodeListItem['priority'],
    dedupeKey: row.dedupeKey,
    outcome: row.outcome,
    outcomeNote: row.outcomeNote,
    workflowId: row.workflowId,
    workflowRunId: row.workflowRunId,
    openedAt: row.openedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

function toStepRecord(s: {
  id: string;
  episodeId: string;
  agentId: number | null;
  sequence: number;
  kind: string;
  status: string;
  model: string | null;
  promptKey: string | null;
  aiInvocation: { promptTokens: number; completionTokens: number; costUsd: { toString(): string } | null } | null;
  toolName: string | null;
  toolScope: string | null;
  toolTier: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  gateDecision: unknown;
  output: unknown;
  confidence: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: Date;
  finishedAt: Date | null;
}): StepRecord {
  return {
    id: s.id,
    episodeId: s.episodeId,
    agentId: s.agentId,
    sequence: s.sequence,
    kind: s.kind as StepRecord['kind'],
    status: s.status as StepRecord['status'],
    model: s.model,
    promptKey: s.promptKey,
    // Sourced from the AiInvocation ledger via the FK (inline columns
    // dropped in PR 12). Null for non-LLM steps with no invocation.
    tokensInput: s.aiInvocation?.promptTokens ?? null,
    tokensOutput: s.aiInvocation?.completionTokens ?? null,
    costUsd: s.aiInvocation?.costUsd?.toString() ?? null,
    toolName: s.toolName,
    toolScope: s.toolScope,
    toolTier: s.toolTier as StepRecord['toolTier'],
    toolArgs: (s.toolArgs as Record<string, unknown>) ?? null,
    toolResult: (s.toolResult as Record<string, unknown>) ?? null,
    gateDecision: s.gateDecision ?? null,
    output: (s.output as Record<string, unknown>) ?? null,
    confidence: s.confidence,
    errorMessage: s.errorMessage,
    durationMs: s.durationMs,
    startedAt: s.startedAt.toISOString(),
    finishedAt: s.finishedAt?.toISOString() ?? null,
  };
}

function toApprovalRecord(a: {
  id: string;
  episodeId: string;
  stepId: string;
  requestedAt: Date;
  expiresAt: Date;
  proposedAction: unknown;
  claimedByUserId: number | null;
  claimedAt: Date | null;
  decision: string | null;
  decidedByUserId: number | null;
  decidedAt: Date | null;
  editedAction: unknown;
  rejectionReason: string | null;
  terminateEpisode: boolean;
}): ApprovalRecord {
  return {
    id: a.id,
    episodeId: a.episodeId,
    stepId: a.stepId,
    requestedAt: a.requestedAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
    proposedAction: (a.proposedAction as Record<string, unknown>) ?? {},
    claimedByUserId: a.claimedByUserId,
    claimedAt: a.claimedAt?.toISOString() ?? null,
    decision: a.decision as ApprovalRecord['decision'],
    decidedByUserId: a.decidedByUserId,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    editedAction: (a.editedAction as Record<string, unknown>) ?? null,
    rejectionReason: a.rejectionReason,
    terminateEpisode: a.terminateEpisode,
  };
}

/**
 * Pick the most-recent decided approval by `decidedAt`. Returns null when
 * the episode has no decided approvals (pure-autonomous run or still
 * pending). Exported for unit test visibility.
 */
export function pickMostRecentDecidedApproval(approvals: ApprovalRecord[]): ApprovalRecord | null {
  const decided = approvals.filter((a) => a.decision !== null && a.decidedAt !== null);
  if (decided.length === 0) return null;
  return decided.reduce((latest, a) => {
    if (!latest.decidedAt) return a;
    if (!a.decidedAt) return latest;
    return a.decidedAt > latest.decidedAt ? a : latest;
  });
}

// ─── Cursor ──────────────────────────────────────────────────────────────

function formatCursor(openedAt: Date, id: string): string {
  return `${openedAt.toISOString()}|${id}`;
}

function parseCursor(raw: string | undefined): { openedAt: Date; id: string } | null {
  if (!raw) return null;
  const sep = raw.indexOf('|');
  if (sep === -1) return null;
  const openedAt = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(openedAt.getTime()) || !id) return null;
  return { openedAt, id };
}

// ─── Handled window + row mapper ─────────────────────────────────────────

/**
 * Resolve the `window` query param (or custom from/to) to a concrete
 * `{from, to}` pair using the tenant's timezone. Single source of truth
 * for Handled tab window math.
 */
export function resolveWindow(
  query: Pick<ListHandledEpisodesQuery, 'window' | 'from' | 'to'>,
  tz: string,
): { from: Date; to: Date } {
  const now = DateTime.now().setZone(tz);
  const window = query.window ?? 'today';

  switch (window) {
    case 'today':
      return { from: now.startOf('day').toJSDate(), to: now.toJSDate() };
    case '7d':
      return { from: now.minus({ days: 7 }).toJSDate(), to: now.toJSDate() };
    case '30d':
      return { from: now.minus({ days: 30 }).toJSDate(), to: now.toJSDate() };
    case 'this_month':
      return { from: now.startOf('month').toJSDate(), to: now.toJSDate() };
    case 'custom': {
      const from = query.from ? DateTime.fromISO(query.from, { zone: tz }).toJSDate() : now.startOf('day').toJSDate();
      const to = query.to ? DateTime.fromISO(query.to, { zone: tz }).toJSDate() : now.toJSDate();
      return { from, to };
    }
  }
}

/**
 * Row shape the mapper receives — matches the Prisma include on listHandled.
 * `entitySuppressions` is scoped by the `sourceEpisodeId` back-relation;
 * the mapper promotes the first (most-recent, unexpired) row into
 * `activeSuppression` on the wire shape.
 */
interface HandledRow extends EpisodeWithRels {
  responsibility: { key: string; title: string };
  ownerAgent: { key: string; name: string };
  approvals: Array<{
    decision: ApprovalDecision | null;
    decidedByUserId: number | null;
    decidedBy: { firstName: string | null; lastName: string | null } | null;
  }>;
  entitySuppressions: Array<{
    id: string;
    suppressUntil: Date | null;
  }>;
}

function toHandledListItem(row: HandledRow): HandledListItem {
  const mostRecent = row.approvals[0] ?? null;
  const humanDecision: ApprovalDecision | null = mostRecent?.decision ?? null;

  const decidedByFirst = mostRecent?.decidedBy?.firstName ?? null;
  const decidedByLast = mostRecent?.decidedBy?.lastName ?? null;
  const decidedByName =
    decidedByFirst || decidedByLast ? `${decidedByFirst ?? ''} ${decidedByLast ?? ''}`.trim() : null;

  const closedAtDate = row.closedAt ?? row.updatedAt;
  const durationMs = closedAtDate.getTime() - row.openedAt.getTime();

  return {
    id: row.id,
    episodeId: row.id,
    decisionTitle: row.entityLabel ?? row.responsibility.title,
    entityType: row.entityType,
    entityId: row.entityId,
    entitySubtitle: null,
    agentKey: row.ownerAgent.key,
    agentName: row.ownerAgent.name,
    responsibilityKey: row.responsibility.key,
    responsibilityTitle: row.responsibility.title,
    priority: row.priority as Priority,
    status: row.status as EpisodeStatus,
    openedAt: row.openedAt.toISOString(),
    requestedAt: null,
    expiresAt: null,
    escalationReason: row.status === EPISODE_STATUS.ESCALATED ? row.outcomeNote : null,
    closedAt: closedAtDate.toISOString(),
    outcome: row.outcome ?? 'unknown',
    durationMs,
    humanDecision,
    decidedByUserId: mostRecent?.decidedByUserId ?? null,
    decidedByName,
    activeSuppression: row.entitySuppressions[0]
      ? {
          id: row.entitySuppressions[0].id,
          suppressUntil: row.entitySuppressions[0].suppressUntil?.toISOString() ?? null,
        }
      : null,
  };
}
