/**
 * The app's deadline kinds (ADR "Outbox and deadlines") — your vocabulary, like the event registry.
 *
 * A timer is a `deadlines` row: a domain service calls `DeadlineService.schedule(tx, …)` (or `cancel`) inside the
 * transaction of the write that needs it, and the sweeper on `bulk-ops` fires it when it comes due. Each kind has
 * exactly one handler, which registers itself with `DEADLINE_HANDLERS` on module init, re-reads Postgres and returns
 * `fired`, `cancelled` or `reschedule`:
 *
 *   export const DEADLINE_KINDS = { INVOICE_REMINDER: 'INVOICE_REMINDER' } as const;
 *
 *   @Injectable()
 *   export class InvoiceReminderHandler implements DeadlineHandler, OnModuleInit {
 *     readonly kind = DEADLINE_KINDS.INVOICE_REMINDER;
 *     constructor(@Inject(DEADLINE_HANDLERS) private readonly handlers: DeadlineHandlerRegistry) {}
 *     onModuleInit() { this.handlers.register(this); }
 *     async fire(deadline: Deadline): Promise<DeadlineOutcome> { … }
 *   }
 *
 * with `DeadlinesModule` in the owning module's `imports`. The template ships no production kind; a kind with no
 * registered handler is retried with backoff and shows as failing on the super-admin Timers page. `kind` is stored
 * as VarChar(60).
 */
export const DEADLINE_KINDS = {} as const satisfies Record<string, string>;

export type DeadlineKind = (typeof DEADLINE_KINDS)[keyof typeof DEADLINE_KINDS];
