---
owner: foundation
sources:
  - docs/adr/0003-outbox-and-deadlines.md
  - packages/appshore/kernel/src/infrastructure/queue/queue.constants.ts#bullJobIdFromDbId
  - packages/appshore/kernel/src/infrastructure/queue/job-handler.contract.ts#QueueJobHandler
  - packages/appshore/kernel/src/infrastructure/queue/job-envelope.helper.ts#buildJobEnvelope
  - packages/appshore/kernel/src/infrastructure/queue/queue-processing-mode.ts#applyQueueProcessingMode
  - apps/backend/src/platform-glue/queue/job-names.ts#APP_JOB_NAMES
  - apps/backend/src/platform-glue/queue/queue.module.ts
  - apps/backend/src/platform-glue/queue/dispatchers/bulk-ops-queue.module.ts#BulkOpsQueueModule
  - apps/backend/src/platform-glue/queue/job-context.ts#APP_JOB_CONTEXT
  - apps/backend/src/domains/integrations/oauth/oauth-refresh.processor.ts#OAuthRefreshJobHandler
  - packages/appshore/platform/src/infrastructure/deadlines/deadline.types.ts#DeadlineHandler
  - packages/appshore/platform/src/infrastructure/deadlines/deadline.sweeper.ts#DEADLINE_HANDLER_TIMEOUT_MS
  - packages/appshore/platform/src/infrastructure/deadlines/deadline.service.ts#DeadlineService
  - apps/backend/src/platform-glue/deadlines/deadline-kinds.ts#DEADLINE_KINDS
  - apps/backend/src/platform-glue/deadlines/__tests__/deadlines.integration.spec.ts
  - apps/backend/src/main.ts
  - apps/backend/src/worker.ts
guards:
  - foundation-vocabulary.spec.ts
  - no-competing-queue-workers.spec.ts
  - bulk-ops-handlers.spec.ts
  - bullmq-job-id-conventions.spec.ts
  - queue-roles.spec.ts
  - rls-job-context-coverage.spec.ts
  - deadline.service.spec.ts
  - deadline.sweeper.spec.ts
  - cron-run-coverage.spec.ts
  - queue-processing-mode.spec.ts
  - deadlines.module.spec.ts
  - deadline-sweep.scheduler.spec.ts
  - schema-enum-conventions.spec.ts
examples:
  - REPORTS
  - offerNumber
---

# Jobs and deadlines: BullMQ topology, job ids, idempotent handlers, deadlines as rows, API and worker roles, shutdown

Work that does not answer a request runs on BullMQ; a timer tied to a write is a Postgres row. The decision for timers
is the ADR "Outbox and deadlines", `docs/adr/0003-outbox-and-deadlines.md`; why state stays in Postgres while an
engine only orchestrates is the ADR "State lives in Postgres; the workflow engine only orchestrates",
`docs/adr/0017-state-lives-in-postgres.md`. Events are in [`events-and-outbox.md`](events-and-outbox.md).

| Tier                            | Queue            | Purpose                                            |
| ------------------------------- | ---------------- | -------------------------------------------------- |
| 1 — Real time (people waiting)  | `events`         | Durable event bus, the fan-out spine               |
|                                 | `notifications`  | Outbound SMS, push, email, in-app                  |
|                                 | `webhooks`       | Outbound webhooks to customer systems              |
| 2 — Compute                     | `ai-interactive` | AI a person is waiting on                          |
|                                 | `ai-background`  | Autonomous and background AI work                  |
| 3 — Background (eventual is ok) | `bulk-ops`       | Mass operations, the relay, the sweeper, retention |

The source of truth is `packages/appshore/kernel/src/infrastructure/queue/queue.constants.ts`.

## Rules

### Queues and job names

- The kernel's `QUEUE_NAMES`, per-queue `*_JOB_NAMES`, `TYPE_DISPLAY_NAMES`, `JOB_CATEGORIES` and
  `MANUAL_CATEGORY_TYPES` list only what the foundation runs. A product's queues and jobs go in
  `apps/backend/src/platform-glue/queue/job-names.ts`: `APP_QUEUE_NAMES`, `APP_JOB_NAMES` (one object per queue, keyed by
  the queue's constant key), `APP_JOB_DISPLAY_NAMES`, `APP_JOB_CATEGORIES`, `APP_MANUAL_TYPES`. `queue.module.ts`
  merges them with `buildJobVocabulary`; a key defined twice fails at boot. [guard: foundation-vocabulary.spec.ts]
- A new queue keeps the tier discipline (slow or vendor work away from work a person waits on) and gets exactly one
  dispatcher: a `WorkerHost` under `apps/backend/src/platform-glue/queue/dispatchers/` extending
  `BaseQueueDispatcher`, which routes by `job.name`. Two `@Processor` classes on one queue compete and drop jobs.
  [guard: no-competing-queue-workers.spec.ts]
- Domain code implements `QueueJobHandler`: `jobNames` (the names it owns) and `run(job)` (throw to retry). The
  queue's dispatcher module assembles its handlers into `jobHandlersToken(queueName)` with an explicit factory, so the
  owning module exports the handler. Never add a `@Processor` to an existing queue.
  [guard: no-competing-queue-workers.spec.ts]
- Every handler is wired, or its jobs complete as silent no-ops: on `bulk-ops` the handlers are listed in the factory
  of `platform-glue/queue/dispatchers/bulk-ops-queue.module.ts`, and every `BULK_OPS_JOB_NAMES` and
  `APP_JOB_NAMES.BULK_OPS` entry maps to its handler. [guard: bulk-ops-handlers.spec.ts]
- A custom job id is built with `bullJobIdFromDbId(category, dbId)` (BullMQ rejects a pure integer).
  [guard: bullmq-job-id-conventions.spec.ts]
- Default job options, set once in `queue.module.ts`: 3 attempts, exponential backoff from 10 seconds, removed on
  complete after 24 hours and on fail after 7 days; a dispatcher hands a job past its retries to `DeadLetterService`.
  A call site that overrides them says why. [review-only: options at a call site need reading]
- Every job name declares its tenant context in `apps/backend/src/platform-glue/queue/job-context.ts`, and each job
  runs inside `withJobContext`. [guard: rls-job-context-coverage.spec.ts]
- A handler is idempotent: delivery is at least once, so a second run of the same job changes nothing. Never mint a
  fresh id inside a retryable handler. [review-only: needs a run-twice test, see testing.md]
- A job's data is a `JobEnvelope` built with `buildJobEnvelope(payload, { tenantId, source })`: it takes the
  request's id from `requestContextStorage` as `correlationId` (a fresh one outside a request), so the worker's log
  lines join the request's. [review-only: the envelope at a call site needs reading]
- A periodic task is a repeatable job or a `@Cron`; every cron run is covered by the run log.
  [guard: cron-run-coverage.spec.ts]

### API and worker roles

- `main.ts` (API) and `worker.ts` boot the same `AppModule`, so both consume every queue by default.
  `QUEUE_PROCESSORS_ENABLED=false` makes a process producer-only: `applyQueueProcessingMode()` swaps BullMQ's worker
  class before the app is created. Only `main.ts` calls it, so no value stops the worker.
  [guard: queue-processing-mode.spec.ts, queue-roles.spec.ts]
- The switch ships off: Terraform `api_queue_processors_enabled` defaults to `true`. To turn it on, run a worker first
  (`worker_desired_count > 0`), then set it to `false`; a precondition in `ecs.tf` refuses `false` with no worker. Set it
  only through Terraform, never in Doppler. [review-only: Terraform validates it; no unit spec]
- With it on, events fired in the worker reach no SSE client; screens see the change on their next fetch.
  [review-only: a known limit in the ADR]
- A second worker lane (AI work in its own task) registers each processor only when its lane runs in the process, held
  by a spec. The template has one lane and ships no gate. [review-only: nothing to hold yet]

### Deadlines: a timer is a row

- A one-off timer tied to a write ("remind in 3 days", "expire at midnight") is a `deadlines` row written with
  `DeadlineService.schedule(tx, …)` on the write's own transaction, and cancelled with `cancel(tx, …)` the same way.
  Never a delayed BullMQ job, a `setTimeout` or a workflow sleep. [guard: deadline.service.spec.ts]
- The subject is a public id, never an `Int` key; scheduling the same `dedupeKey` again supersedes the pending row.
  [guard: deadline.service.spec.ts]
- Kinds are the app's: `DEADLINE_KINDS` in `apps/backend/src/platform-glue/deadlines/deadline-kinds.ts`. `kind` is a
  `VarChar(60)`, so a product never edits the foundation schema. [guard: schema-enum-conventions.spec.ts]
- One handler per kind: it implements `DeadlineHandler`, injects `DEADLINE_HANDLERS`, calls `register(this)` in
  `onModuleInit`, and its module imports `DeadlinesModule`. A second handler for a kind throws at boot.
  [guard: deadlines.module.spec.ts]
- The handler re-reads Postgres (the row's `payload` is a hint), returns `{ outcome: 'fired' }`, `'cancelled'` with a
  reason, or `'reschedule'` with a new `dueAt`, is safe to run twice, finishes in 60 seconds, and raises its own events
  through `OutboxService.transaction`. Throwing is fine: the sweeper records `lastError` and backs off from 30 seconds
  to an hour, for ever; a failing timer shows on `/admin/timers`. [guard: deadline.sweeper.spec.ts]
- The sweeper is `DeadlineSweeper`, the `deadline-sweep` job on `bulk-ops`, every 30 seconds, sharing the lane with the
  relay and retention at concurrency 1. [guard: deadline-sweep.scheduler.spec.ts]

### Graceful shutdown

- `main.ts` and `worker.ts` enable shutdown hooks. On SIGTERM each awaits `app.close()` (in-flight requests drain;
  the destroy hooks close the BullMQ workers and Prisma, `PrismaService.onModuleDestroy`), then `shutdownTelemetry()`,
  and only then exits. The shared Redis client has no hook and ends with the process. A new resource closes in
  `OnModuleDestroy`; nothing exits before `app.close()` returns. [review-only: shutdown order is read, not tested]

## Recipe: add a job

Copied from `apps/backend/src/domains/integrations/oauth/oauth-refresh.processor.ts` (one tenant's run, on
`bulk-ops`):

```typescript
@Injectable()
export class OAuthRefreshJobHandler implements QueueJobHandler {
  readonly jobNames = [APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH];

  async run(bullJob: Job<JobEnvelope<OAuthRefreshJobData>>): Promise<void> {
    const { tenantId, integrationId, vendor } = bullJob.data.payload;
    const cron = new CronRun(this.logger, OAUTH_REFRESH_JOB_NAME); // every run, skipped or not, completes it
    const config = await this.prisma.integrationConfig.findFirst({ where: { integrationId, tenantId } });
    if (!config) {
      cron.complete({ vendor, skipped: 'integration not found' }); // re-read state: a second run changes nothing
      return;
    }
    // ... the work; a retryable failure is thrown back to BullMQ
  }
}
```

1. Name it in `apps/backend/src/platform-glue/queue/job-names.ts`: `APP_JOB_NAMES.<QUEUE>.<NAME>` and its label in
   `APP_JOB_DISPLAY_NAMES` (a new queue: `APP_QUEUE_NAMES` and one dispatcher under `dispatchers/`).
2. Declare its tenant context in `job-context.ts` (`APP_JOB_CONTEXT`): `{ tenant: true }` when the payload names the
   tenant, `forEachTenant` or `system` with a reason in `APP_SYSTEM_REASONS`.
3. Write the handler: `jobNames`, `run(job)`, idempotent, a `CronRun` if it repeats; export it from its module.
4. Wire it: add it to the factory and `inject` list in the queue's dispatcher module (`bulk-ops-queue.module.ts`).
5. Enqueue with `buildJobEnvelope` and, for a custom id, `bullJobIdFromDbId`; a repeatable registers on module init,
   as `ai-credential-revalidation.job.ts` does.
6. Run `pnpm verify:arch`: the vocabulary, wiring, job-id, tenant-context and cron specs fail on a step left out.

## Recipe: add a deadline

There is no production kind in the starter. The shape is the header of
`apps/backend/src/platform-glue/deadlines/deadline-kinds.ts`, and `deadlines.integration.spec.ts` beside it runs a test
kind end to end on a real Postgres:

```typescript
export const DEADLINE_KINDS = { INVOICE_REMINDER: 'INVOICE_REMINDER' } as const;

@Injectable()
export class InvoiceReminderHandler implements DeadlineHandler, OnModuleInit {
  readonly kind = DEADLINE_KINDS.INVOICE_REMINDER;
  constructor(@Inject(DEADLINE_HANDLERS) private readonly handlers: DeadlineHandlerRegistry) {}
  onModuleInit() {
    this.handlers.register(this);
  }
  async fire(deadline: Deadline): Promise<DeadlineOutcome> {
    /* re-read, act, return { outcome: 'fired' } */
  }
}

// In the write that needs the timer, on the same transaction:
await this.deadlines.schedule(tx, {
  tenantId,
  kind: DEADLINE_KINDS.INVOICE_REMINDER,
  subjectType: 'invoice',
  subjectId: invoice.publicId,
  dedupeKey: `invoice:${invoice.publicId}:remind`,
  dueAt,
});
```

1. Add the kind to `DEADLINE_KINDS`.
2. Write the handler: `kind`, register in `onModuleInit`, `fire` re-reads Postgres and returns `fired`, `cancelled`
   with a reason, or `reschedule`; its writes and events go through `OutboxService.transaction`.
3. Import `DeadlinesModule` in the owning module and provide the handler.
4. Call `schedule(tx, …)` inside the write's transaction (the outbox callback's `tx` works), and `cancel(tx, …)` in
   every write that makes the timer moot.
5. Test the handler twice over the same row; it must change nothing the second time. Watch it on `/admin/timers`.

## Flag in review

- A product job name added to the kernel's lists.
- A second `@Processor` on a queue; a handler missing from its dispatcher factory.
- An integer job id; a job with no declared tenant context.
- A delayed job or `setTimeout` used as a timer.
- A deadline handler that trusts its payload, or is not safe to run twice.
- `QUEUE_PROCESSORS_ENABLED` set in Doppler.
