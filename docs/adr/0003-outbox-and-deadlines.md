# ADR-0003 — Outbox and deadlines

**Date:** 2026-11-12 · **Status:** Adopted. The outbox ships with this record. The deadlines part is decided here
and its code lands in the pull request that adds the `Deadline` table and the sweeper; until then that section
describes the target, not the code.

## Context

The starter keeps state in Postgres and moves work through BullMQ. The seam between the two had two gaps.

1. **An event could be lost between commit and emit.** Every domain write committed its transaction and then
   called `DomainEventService.emit()`. A crash, a deploy or an unreachable Redis in that gap dropped the event,
   and the event log, outbound webhooks, cache invalidation and the SSE refresh all hang off it. `emit` even
   swallowed a failed durable enqueue, so nothing recorded the event and nothing could retry it. A few producers
   skipped the durable path altogether (`EventEmitter2.emit(name, new DomainEvent(…))`).
2. **A one-off timer needed Inngest.** Recurring jobs run on BullMQ, but a timer tied to a write ("lapse this in
   48 hours unless someone acts") had no home except a workflow engine, and nothing answered "what is the system
   waiting on, and when does it fire?".

## Decision

**A domain event exists if and only if the write behind it committed. A timer is a row.** Both are app-blind
mechanisms in `@appshore/platform` and `foundation.prisma`.

### The outbox

- **`OutboxEvent`** (`outbox_events`): one row per domain event, written in the same transaction as the change it
  describes. `id` is the event's own UUIDv7; `tenantId` is a string as `DomainEvent` carries it (`'global'`
  allowed, so no foreign key); `data` is JSONB; then actor id, type and label, `correlationId`, `causationId`,
  `occurredAt`, `publishedAt?`, `attempts`, `leaseExpiresAt?`, `lastError?`. The `actor_agent` JSONB column is
  reserved for machine identity: nullable and unused until that work lands, kept now so it needs no migration.
- **`OutboxService.transaction((tx, emit) => …)`** runs `prisma.$transaction`. Each `emit(name, tenantId, data,
actor?, opts?)` takes the same arguments as `DomainEventService.emit` and stages a row on `tx`. After the commit
  the staged events are published at once, in order (listeners fire before the caller returns, as before), and
  marked published with one update. A rollback publishes nothing. Publishing never fails the caller: the change is
  committed and the row is durable. The first failure stops the run, so a later event never overtakes an earlier
  one; the rest wait for the relay.
- **`stage(tx, …)` + `publishStaged(events)`** is the lower-level form for code that already owns its
  transaction. Publication is always an explicit step after the commit.
- **Publishing reuses the kernel's two paths** (the in-process bus and the durable `events` queue) through
  `DomainEventService.publish(event)`, which keeps the staged event's id and timestamp. So the durable job id, the
  `domain_event_log` row and the webhook payload `id` all equal the outbox row's id. Unlike `emit`, `publish`
  throws when the durable enqueue fails, so the row stays unpublished.
- **The relay** (`OutboxRelay`, the repeatable job `outbox-relay` on `bulk-ops`, every 10 seconds) claims
  unpublished rows older than a 30-second grace with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT
n)` and a 60-second lease, publishes them in `occurredAt` order and marks them. A row that fails records
  `lastError` and retries when its lease runs out; it does not hold back the rows after it. Two relays never
  publish one row at once. Published rows are purged after 7 days, in bounded batches. The relay runs with no
  `job_schedules` row; a row `('maintenance', 'outbox-relay')` can pause it or change its interval, honoured on
  every boot.
- **The grace and the transaction timeout are tied.** `occurredAt` is stamped when a row is staged, not when its
  transaction commits. So `OutboxService.transaction` caps a transaction's `timeout` at 15 seconds
  (`OUTBOX_TRANSACTION_TIMEOUT_MAX_MS`) and the grace is twice that: a row that has only just become visible is
  never already past the grace, and the relay never races the request path. Code that uses `stage` +
  `publishStaged` keeps its transaction within the same bound.
- **An over-long attribution value never fails the write.** `toOutboxRow` caps actor id, type and label and the
  correlation and causation ids to their columns; `actor_label` is VARCHAR(255) to fit an email whole.

### Every event goes through the outbox

Every domain event with a write behind it is staged in that write's transaction, in the app's domains and in the
platform's own. When this record was written that meant 12 producer files and 28 call sites: API keys (5), OAuth
clients (5), feature flags (1), Desk (suppression 3, trigger 1, episode 1, close step 1) and AI (conversation
session 2, HITL challenge 2, invocation logger 2, `AI_INVOCATION_RECORDED` 1).

**The allowlist.** `apps/backend/src/architecture/no-direct-emit.spec.ts` counts, per file, every direct
`DomainEventService.emit` or `.publish` and every `new DomainEvent(` built outside the outbox files. Only the
entries in `no-direct-emit.allowlist.json` may do so, each with a file, a count and a reason. It fails on a direct
emit beyond the list, on a stale entry and on an entry without a reason. A new entry must be a signal with no
write behind it, never a change. Today it holds:

| File                                         | Signals                                                                               | Why not the outbox                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-telemetry.service.ts`                    | `AI_BUDGET_HARD_BREACHED`, `AI_BUDGET_SOFT_BREACHED`, `AI_ZERO_RETENTION_UNAVAILABLE` | Raised on every AI pre-flight from cached spend or settings. No write behind them; they must not cost a write per call or need the database.                                                                                                                                             |
| `notifications/pipeline/delivery.service.ts` | `NOTIFICATION_SENT`                                                                   | An in-process signal for the SSE bridge (it plays the new-notification sound). The notification row is the durable record. Through the outbox every in-app notification would also become an events job and an event-log row, and a relayed copy fires where no SSE client is connected. |

### Delivery is at least once

A crash after publish and before the mark publishes again, and a failed durable job retries. **Rule: every
consumer is keyed on the event id or re-reads state, so a second delivery changes nothing.**

| Consumer                                                                 | A second delivery                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable enqueue (`DomainEventService`)                                   | The BullMQ job id is the event name plus the event id. A second add is ignored while the first job is kept (1 day done, 7 days failed); the relay re-sends within minutes.                                                                                                                                                                                                                                                                                  |
| Event log (`event-persistence.subscriber.ts`)                            | Upsert on the event id.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Outbound webhooks (`webhooks/dispatcher.service.ts`, in the durable job) | Idempotent per event and subscription: a delivery log row already written for this event is found by its `event_id` column (unique with `subscription_id`, so the lookup is one keyed read and a concurrent second insert is refused) and reused, a finished one is left alone, and the delivery job id is built from the event id and the subscription id, so BullMQ ignores a second add. The payload `id` is the event id, so a receiver can dedupe too. |
| Cache invalidation (in-process)                                          | Deletes keys again. Harmless.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| SSE bridge (in-process)                                                  | A second push is a second refetch signal; screen state comes from the query. `NOTIFICATION_SENT`, the one push that plays a sound, does not go through the relay.                                                                                                                                                                                                                                                                                           |
| Desk event bridge (in-process; empty in the starter)                     | A handler added there passes the event id as the Inngest event id, so Inngest drops the copy. The file's comment says so.                                                                                                                                                                                                                                                                                                                                   |

Named notification triggers are called directly by services, not by events, so they are not consumers.

`apps/backend/src/platform-glue/events/__tests__/double-delivery.spec.ts` publishes one event twice through the
real listeners and runs the durable job twice. It holds one durable job id, one event-log row, one webhook
delivery per subscription and no throw from the in-process listeners.

`apps/backend/src/architecture/bulk-ops-handlers.spec.ts` holds the wiring. The bulk-ops dispatcher completes an
unknown job name as a silent no-op, so a relay handler left out of the factory would never run and nothing would
fail. The spec fails instead, for every name in `BULK_OPS_JOB_NAMES`.

### Deadlines

- **`Deadline`**: one row per timer, with `kind` (an app-owned string vocabulary, like event names), `tenantId`,
  the subject's type and public id, `dedupeKey`, `dueAt`, `payload`, `firedAt?`, `cancelledAt?`, `cancelReason?`,
  `attempts`, a lease and `lastError?`. One pending row per tenant and dedupe key: scheduling the same key again
  supersedes the pending row.
- **`DeadlineService.schedule(tx, …)` and `cancel(tx, …)`** write in the business transaction, so a timer exists
  if and only if the change that needs it committed.
- **Handlers** register by kind, re-read Postgres and return `fired`, `cancelled` or `reschedule`. They are
  idempotent; their own writes and events go through the outbox.
- **The sweeper** (a repeatable job on `bulk-ops`, every 30 seconds) claims due rows with `FOR UPDATE SKIP LOCKED`
  and a lease, runs the handler and stamps the outcome. A failing handler gets `lastError` and a capped backoff,
  and is never given up on.
- A plain timer no longer needs Inngest. That is what lets Desk become optional.

## Consequences

- Events are as durable as the writes they describe. Payloads did not change.
- One more insert per event on the write path and one small update after the commit. The relay is idle when the
  request path succeeds.
- Some events that used to be in-process only now also reach the durable path: the two Desk suppression events
  were raised with a raw `EventEmitter2.emit`, so they had no event-log row and no webhook. They now have both
  (both are internal, so no webhook leaves).
- An idempotent AI ledger replay (same `idempotencyKey`) writes nothing and so raises no second
  `AI_INVOCATION_RECORDED`.
- The schema linter wants every `DateTime` to end in `At`, so the relay lease is `leaseExpiresAt`.

## Known limits

- **SSE pushes fire where the event was published.** A relayed event, and any event emitted from a job, fires its
  in-process listeners in the process that ran it. An SSE client connected to another process gets no push and
  sees the change on its next fetch. This is true today wherever a worker task runs. If a product stops the API
  from consuming queues, every job-originated and relayed event fires in the worker, where no SSE client is
  connected.
- **The relay and the sweeper share the `bulk-ops` lane** with data retention, at concurrency 1. A long retention
  run delays crash recovery, and makes timers fire late, by that long. A product with long retention runs gives
  the two their own queue.
- **Row-level security.** A product that adds tenant-context plumbing for RLS treats `OutboxService.transaction`
  as a transaction entry point.
