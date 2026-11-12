import { BadRequestException, Injectable } from '@nestjs/common';
import type { Deadline, Prisma } from '@appshore/db';
import type {
  DeadlineHealth,
  DeadlineListItem,
  DeadlineListResponse,
  DeadlineListSort,
  DeadlineState,
} from '@app/shared-types';
import { DEADLINE_STATES, DEFAULT_DEADLINE_LIST_SORT } from '@app/shared-types';
import {
  buildCursorPage,
  clampCursorLimit,
  decodeCursor,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { PrismaService } from '../database/prisma.service';
import {
  DEADLINE_SUPERSEDED_REASON,
  PENDING_DEADLINE,
  type CancelDeadlineInput,
  type ScheduleDeadlineInput,
} from './deadline.types';

/** The kinds filter offers at most this many (an open vocabulary, but a short one). */
export const MAX_DEADLINE_KINDS = 100;

/** A pending row this far past its due time counts as overdue — a few sweeps late, not one. */
export const DEADLINE_OVERDUE_GRACE_MS = 5 * 60_000;

const INVALID_CURSOR_MESSAGE = 'This list position is no longer valid — reload the list';
/** Marks which sort issued a cursor, so one sort's position is never read as another's. */
const SORT_TAG_SEPARATOR = ':';
/** `Deadline.id` is a Postgres uuid — a cursor id that is not one would reach Postgres and 500. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Each derived state as a `where` fragment — disjoint and exhaustive (a row is counted once,
 * whatever the pivot): terminal stamps first, then pending split by whether the last run threw.
 */
const STATE_WHERE: Record<DeadlineState, Prisma.DeadlineWhereInput> = {
  PENDING: { ...PENDING_DEADLINE, lastError: null },
  FAILING: { ...PENDING_DEADLINE, lastError: { not: null } },
  FIRED: { firedAt: { not: null } },
  CANCELLED: { firedAt: null, cancelledAt: { not: null } },
};

const LIST_INCLUDE = { tenant: { select: { tenantId: true, companyName: true } } } as const;
type DeadlineWithTenant = Prisma.DeadlineGetPayload<{ include: typeof LIST_INCLUDE }>;

export interface DeadlineListQuery {
  limit?: number | string;
  cursor?: string;
  states?: DeadlineState[];
  kind?: string;
  /** The tenant's slug (`tenants.tenant_id`). */
  tenant?: string;
  sort?: DeadlineListSort;
}

/**
 * Timers as rows (ADR "Outbox and deadlines"). `schedule` / `cancel` run on the caller's transaction, so a timer
 * exists if and only if the change that needs it committed; the sweeper fires them. The reads
 * (`list`, `health`) back the super-admin Timers page.
 */
@Injectable()
export class DeadlineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Schedule a timer on `tx`. A pending row with the same (tenant, dedupeKey) is cancelled as
   * `superseded` first; the partial unique index refuses a second pending row for the key if two
   * transactions race (the loser gets a unique violation and rolls back).
   */
  async schedule(tx: Prisma.TransactionClient, input: ScheduleDeadlineInput): Promise<Deadline> {
    await tx.deadline.updateMany({
      where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey, ...PENDING_DEADLINE },
      data: { cancelledAt: new Date(), cancelReason: DEADLINE_SUPERSEDED_REASON, lockedUntilAt: null },
    });
    return tx.deadline.create({
      data: {
        id: generateUuidV7(),
        tenantId: input.tenantId,
        kind: input.kind,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        dedupeKey: input.dedupeKey,
        dueAt: input.dueAt,
        payload: input.payload ?? {},
      },
    });
  }

  /** Cancel pending timers on `tx` — by key, or every one on a subject (optionally some kinds). Returns how many. */
  async cancel(tx: Prisma.TransactionClient, input: CancelDeadlineInput, reason: string): Promise<number> {
    const target: Prisma.DeadlineWhereInput =
      'dedupeKey' in input
        ? { dedupeKey: input.dedupeKey }
        : {
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            ...(input.kinds ? { kind: { in: input.kinds } } : {}),
          };
    const { count } = await tx.deadline.updateMany({
      where: { tenantId: input.tenantId, ...target, ...PENDING_DEADLINE },
      data: { cancelledAt: new Date(), cancelReason: reason.slice(0, 200), lockedUntilAt: null },
    });
    return count;
  }

  /** Every tenant's deadlines, cursor-paged by due time, with per-state counts (super-admin). */
  async list(query: DeadlineListQuery = {}): Promise<DeadlineListResponse> {
    const take = clampCursorLimit(query.limit);
    const sort = query.sort ?? DEFAULT_DEADLINE_LIST_SORT;
    const direction = sort === 'soonest' ? 'asc' : 'desc';
    const keyset = query.cursor ? this.afterCursor(query.cursor, sort, direction) : undefined;

    const scope: Prisma.DeadlineWhereInput = {};
    if (query.kind) scope.kind = query.kind;
    if (query.tenant) scope.tenant = { tenantId: query.tenant };
    const view = query.states ? { AND: [scope, { OR: query.states.map((state) => STATE_WHERE[state]) }] } : scope;

    const [rows, stateCounts] = await Promise.all([
      this.prisma.deadline.findMany({
        where: keyset ? { AND: [view, keyset] } : view,
        include: LIST_INCLUDE,
        orderBy: [{ dueAt: direction }, { id: direction }],
        take: take + 1,
      }),
      Promise.all(
        DEADLINE_STATES.map((state) => this.prisma.deadline.count({ where: { AND: [scope, STATE_WHERE[state]] } })),
      ),
    ]);

    const counts = Object.fromEntries(DEADLINE_STATES.map((state, i) => [state, stateCounts[i]])) as Record<
      DeadlineState,
      number
    >;
    const total = (query.states ?? DEADLINE_STATES).reduce((sum, state) => sum + counts[state], 0);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.dueAt, `${sort}${SORT_TAG_SEPARATOR}${row.id}`));
    return { items: page.items.map(toListItem), nextCursor: page.nextCursor, total, counts };
  }

  /** What is waiting, what is late, what keeps failing — the Timers page's health strip. */
  async health(now = new Date()): Promise<DeadlineHealth> {
    const overdueWhere: Prisma.DeadlineWhereInput = {
      ...PENDING_DEADLINE,
      dueAt: { lt: new Date(now.getTime() - DEADLINE_OVERDUE_GRACE_MS) },
    };
    const [pending, failing, overdue, oldestOverdue] = await Promise.all([
      this.prisma.deadline.count({ where: STATE_WHERE.PENDING }),
      this.prisma.deadline.count({ where: STATE_WHERE.FAILING }),
      this.prisma.deadline.count({ where: overdueWhere }),
      this.prisma.deadline.findFirst({ where: overdueWhere, orderBy: { dueAt: 'asc' }, select: { dueAt: true } }),
    ]);
    return { pending, failing, overdue, oldestOverdueDueAt: oldestOverdue?.dueAt.toISOString() ?? null };
  }

  /** The kinds on record, A → Z — the options of the Timers page's kind filter. */
  async kinds(): Promise<string[]> {
    const groups = await this.prisma.deadline.groupBy({
      by: ['kind'],
      orderBy: { kind: 'asc' },
      take: MAX_DEADLINE_KINDS,
    });
    return groups.map((group) => group.kind);
  }

  private afterCursor(cursor: string, sort: DeadlineListSort, direction: 'asc' | 'desc') {
    const { sortValue, id } = decodeCursor(cursor);
    const tag = `${sort}${SORT_TAG_SEPARATOR}`;
    if (typeof id !== 'string' || !id.startsWith(tag) || !UUID_PATTERN.test(id.slice(tag.length))) {
      throw new BadRequestException(INVALID_CURSOR_MESSAGE);
    }
    return keysetWhere({
      field: 'dueAt',
      idField: 'id',
      kind: 'date',
      direction,
      cursor: encodeCursor(sortValue, id.slice(tag.length)),
    });
  }
}

export function deadlineState(row: Pick<Deadline, 'firedAt' | 'cancelledAt' | 'lastError'>): DeadlineState {
  if (row.firedAt) return 'FIRED';
  if (row.cancelledAt) return 'CANCELLED';
  return row.lastError ? 'FAILING' : 'PENDING';
}

function toListItem(row: DeadlineWithTenant): DeadlineListItem {
  return {
    id: row.id,
    // The public slug and name only: the tenant's Int key never crosses the API (id-boundary.spec.ts).
    tenant: { tenantId: row.tenant.tenantId, companyName: row.tenant.companyName },
    kind: row.kind,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    dedupeKey: row.dedupeKey,
    state: deadlineState(row),
    dueAt: row.dueAt.toISOString(),
    firedAt: row.firedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    attempts: row.attempts,
    lockedUntilAt: row.lockedUntilAt?.toISOString() ?? null,
    lastError: row.lastError,
    payload: isRecord(row.payload) ? row.payload : {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
