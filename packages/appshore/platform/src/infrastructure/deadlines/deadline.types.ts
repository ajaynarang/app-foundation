import type { Deadline, Prisma } from '@appshore/db';

/**
 * What a handler decided when its deadline came due (ADR "Outbox and deadlines"):
 * - `fired` — the timer did its work (or found the work already done — handlers are idempotent);
 * - `cancelled` — the reason it no longer applies ("the approval was already given");
 * - `reschedule` — the subject's own due time moved; the row waits for `dueAt` instead.
 */
export type DeadlineOutcome =
  | { outcome: 'fired' }
  | { outcome: 'cancelled'; reason: string }
  | { outcome: 'reschedule'; dueAt: Date };

/**
 * One handler per deadline `kind` (a string vocabulary owned by the app, like event names; the template
 * declares it in `apps/backend/src/platform-glue/deadlines/deadline-kinds.ts`).
 * `fire` re-reads Postgres — the row's payload is a hint, never the truth — and must be safe to
 * run twice: a crash between the handler and the stamp re-runs it once the lease lapses.
 * Its own writes and events go through the outbox.
 */
export interface DeadlineHandler {
  readonly kind: string;
  fire(deadline: Deadline): Promise<DeadlineOutcome>;
}

/**
 * The handler registry (a {@link DeadlineHandlerRegistry}). Apps register from their own modules:
 *
 *   @Injectable()
 *   export class ApprovalExpiryHandler implements DeadlineHandler, OnModuleInit {
 *     readonly kind = DEADLINE_KINDS.APPROVAL_EXPIRY;
 *     constructor(@Inject(DEADLINE_HANDLERS) private readonly handlers: DeadlineHandlerRegistry) {}
 *     onModuleInit() { this.handlers.register(this); }
 *     async fire(deadline: Deadline): Promise<DeadlineOutcome> { … }
 *   }
 *
 * with `DeadlinesModule` in the owning module's `imports`. A registry rather than a `multi`
 * provider: Nest does not merge sibling modules' contributions into one array
 * (see `jobHandlersToken`), and a registry lets each domain keep its handler next to its code.
 */
export const DEADLINE_HANDLERS = Symbol('DEADLINE_HANDLERS');

export interface ScheduleDeadlineInput {
  tenantId: number;
  kind: string;
  /** The subject's type and public id — `('order', 'ord_…')`, never an Int PK. */
  subjectType: string;
  subjectId: string;
  /** At most one pending row per (tenant, key); scheduling the key again supersedes it. */
  dedupeKey: string;
  dueAt: Date;
  payload?: Prisma.InputJsonValue;
}

/** Cancel by key, or every pending deadline on a subject (optionally only some kinds). */
export type CancelDeadlineInput =
  | { tenantId: number; dedupeKey: string }
  | { tenantId: number; subjectType: string; subjectId: string; kinds?: string[] };

/** The `cancelReason` stamped on a pending row that a later `schedule` of its key replaced. */
export const DEADLINE_SUPERSEDED_REASON = 'superseded';

/** Default sweeper cadence; the jobSchedule row ('maintenance', 'deadline-sweep') overrides it. */
export const DEFAULT_DEADLINE_SWEEP_INTERVAL_MS = 30_000;
/** The bulk-ops schedules live under `maintenance`, so the admin schedules screen can pause or retune the tick. */
export const DEADLINE_SWEEP_SCHEDULE_CATEGORY = 'maintenance';

/** Prisma `where` fragment for a row that has neither fired nor been cancelled. */
export const PENDING_DEADLINE = { firedAt: null, cancelledAt: null } as const;
