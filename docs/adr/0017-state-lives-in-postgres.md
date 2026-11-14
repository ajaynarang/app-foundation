# ADR-0017 — State lives in Postgres; the workflow engine only orchestrates

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

Long-running work is everywhere in a product: an approval that waits days for a person, a reminder that fires if
nobody acts, an AI agent that runs several steps with a human check in between. A durable workflow engine is built
for exactly that: a function can wait for an event for days and survive a restart. So it is tempting to make the
engine's run the record of the work: "the order is wherever its workflow is".

The starter already answers most of this in Postgres. Every entity is a Prisma model. A domain event is an
`outbox_events` row written in its write's transaction (ADR [Outbox and deadlines](0003-outbox-and-deadlines.md)). A
one-off timer is a `deadlines` row fired by the sweeper on `bulk-ops`. Recurring work is a BullMQ repeatable whose runs
and schedules are the `jobs` and `job_schedules` tables. The optional Desk engine (ADR
[Optional features: Desk is opt-in at scaffold time](0004-optional-features-desk-opt-in.md)) runs on Inngest, and even
there the work's state is Postgres: `DeskEpisode`, `DeskEpisodeStep` and `DeskApproval` rows, written by the services in
the Desk folder, with the engine calling into them.

An engine's run state is opaque vendor state. It cannot be queried with the rest of the data, joined into a report,
exported, scoped by tenant or kept in the same transaction as the write it describes. A product that keeps truth there
cannot answer "what is waiting on whom" from its own database, and loses it when the engine is replaced or removed.

## Decision

**Postgres is the system of record for every piece of business state, every timer and every event. A workflow engine,
a queue or the sweeper only orchestrates around it: it decides when code runs, never what is true.**

- Business state is a row in the Prisma schema, written by a domain service. A step in an engine or a job handler
  changes state only by calling that service, never by holding it in the run. Held by `schema-enum-conventions.spec.ts`
  and the schema linter for the shape of the rows; whether a run holds state is review only, because it needs reading.
- A timer tied to a write is a `deadlines` row scheduled on the write's transaction, never an engine sleep, a delayed
  job or a `setTimeout`. Held by `deadline.service.spec.ts` and `deadlines.integration.spec.ts`; that no code sleeps
  in an engine instead is review only.
- An event the engine waits on is a domain event raised through the outbox, so it exists if and only if the write
  committed. Held by `no-direct-emit.spec.ts`.
- A person's decision (an approval, a sign-off, a reply) is written through the API into Postgres, which raises the
  event; a waiting run resumes on that event. The run never records the decision itself. Review only: the path needs
  reading.
- Every step, handler and job re-reads Postgres before it acts and is safe to run twice: a payload or an engine's
  memory is a hint. Held by `double-delivery.spec.ts` for the event consumers and `deadline.sweeper.spec.ts` for the
  timers; the rest is review only.
- When an engine run and Postgres disagree, Postgres is right. A run that dies, or an engine that is down, is recovered
  from Postgres state and events: the run is replayed or restarted, and nothing true is lost. Review only.

## Consequences

- "What is the system waiting on, and for whom" is a query: pending deadlines (the `/admin/timers` page), open
  approvals and episodes, unpublished outbox rows. An audit or an export reads one database.
- An engine can be swapped or removed without a data migration. That is what lets Desk be opt-in: a product without
  it keeps every timer, event and job it has.
- A step costs a round trip to Postgres to re-read what it needs, and each handler is written to be idempotent. That
  is the price of a crash or a redeploy changing nothing.
- An engine stays the right tool for what it is good at: an AI agent's multi-step run with retries per step, and a
  long fan-out. It is not the place for a plain reminder; that is a deadline.
- A product that adds an engine, or a new kind of long-running work, records it against this decision: its state in
  tables, its timers as deadlines, its waits on outbox events.
