---
owner: foundation
status: interim
pending: F2
sources:
  - docs/adr/0003-outbox-and-deadlines.md
  - packages/appshore/kernel/src/infrastructure/queue/queue.constants.ts#bullJobIdFromDbId
  - packages/appshore/kernel/src/infrastructure/queue/job-handler.contract.ts
  - packages/appshore/kernel/src/infrastructure/queue/queue-processing-mode.ts#applyQueueProcessingMode
  - apps/backend/src/platform-glue/queue/job-names.ts#APP_JOB_NAMES
  - apps/backend/src/platform-glue/queue/queue.module.ts
  - apps/backend/src/platform-glue/queue/dispatchers
  - apps/backend/src/platform-glue/queue/job-context.ts
  - packages/appshore/platform/src/infrastructure/deadlines/deadline.service.ts#DeadlineService
  - apps/backend/src/platform-glue/deadlines/deadline-kinds.ts#DEADLINE_KINDS
  - apps/backend/src/platform-glue/deadlines/__tests__/deadlines.integration.spec.ts
  - apps/backend/src/main.ts
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
examples:
  - REPORTS
  - offerNumber
---

# Jobs and deadlines: BullMQ topology, job ids, idempotent handlers, deadlines as rows, API and worker roles, shutdown

Moved from the old backend skill; condensed with its recipe in its finish pull request. The decision for timers is
the ADR "Outbox and deadlines", `docs/adr/0003-outbox-and-deadlines.md`.

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
- Domain code implements `QueueJobHandler` (`jobNames`, `handle(job)`; throw to retry) and is provided under
  `jobHandlersToken(queueName)`. Never add a `@Processor` to an existing queue. [guard: no-competing-queue-workers.spec.ts]
- Every handler is wired, or its jobs complete as silent no-ops: on `bulk-ops` the handlers are listed in the factory
  of `platform-glue/queue/dispatchers/bulk-ops-queue.module.ts`, and every `BULK_OPS_JOB_NAMES` and
  `APP_JOB_NAMES.BULK_OPS` entry maps to its handler. [guard: bulk-ops-handlers.spec.ts]
- A custom job id is built with `bullJobIdFromDbId(category, dbId)` (BullMQ rejects a pure integer).
  [guard: bullmq-job-id-conventions.spec.ts]
- Default job options: 3 attempts, exponential backoff, removed on complete after 24 hours and on fail after 7 days;
  a job past its retries goes to `DeadLetterService`. [review-only: options at a call site need reading]
- Every job name declares its tenant context in `apps/backend/src/platform-glue/queue/job-context.ts`, and each job
  runs inside `withJobContext`. [guard: rls-job-context-coverage.spec.ts]
- A handler is idempotent: delivery is at least once, so a second run of the same job changes nothing. Never mint a
  fresh id inside a retryable handler. [review-only: needs a run-twice test, see testing.md]
- The request's `requestId` is forwarded into the job payload as `correlationId`, from `requestContextStorage`, so the
  worker's log lines join the request's. [review-only: needs reading]
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

- `main.ts` enables shutdown hooks. On SIGTERM: stop accepting connections, drain in-flight requests (`app.close()`),
  drain the BullMQ workers, flush telemetry, close Prisma and Redis through `OnModuleDestroy`. Never `process.exit()` in
  a shutdown path. [review-only: shutdown order is read, not tested]

## Flag in review

- A product job name added to the kernel's lists.
- A second `@Processor` on a queue; a handler missing from its dispatcher factory.
- An integer job id; a job with no declared tenant context.
- A delayed job or `setTimeout` used as a timer.
- A deadline handler that trusts its payload, or is not safe to run twice.
- `QUEUE_PROCESSORS_ENABLED` set in Doppler.
