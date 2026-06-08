---
title: "ADR-011: Driver-Keyed Messaging Model"
description: Dispatcher-driver conversations key on the driver-dispatch pair, not load-id.
---

# ADR-011: Driver-Keyed Messaging Model

**Date:** 2026-05-20
**Status:** Proposed — drafted from recent code; awaiting acceptance.

## Context

The first iteration of dispatcher↔driver messaging in SALLY keyed conversations on `load_id`. A dispatcher messaging a driver about Load A used a separate thread from the same dispatcher messaging the same driver about Load B. This produced two problems in practice:

1. **Fragmentation.** A driver hauling 3 loads in a day had 3 separate threads with the same dispatcher. Real-life messaging is continuous; the schema fought it.
2. **Out-of-context drift.** Messages about "the next load" or "when you get back" don't belong to any one load. They needed a thread that survives across loads.

The fix is to key on the driver↔dispatcher pair within a tenant, not on a load. Loads are referenced as context inside messages, not as the keying axis.

## Decision

**Conversations are keyed on the (tenant, driver, dispatcher) tuple — not on load.**

- Each `DriverConversation` row represents one driver↔dispatcher thread per tenant. `load_id` is optional metadata on individual messages, not on the conversation.
- The Tower (dispatcher) and the driver mobile view both render this single thread for the pair.
- When a dispatcher messages about a specific load from the load sheet, the message goes into the existing thread with that driver and includes a load reference in the message body (a chip rendered in the UI from the `load_id` on the message). Not a new thread.
- The relay-leg case (a driver hands a load off to another driver mid-route) still routes through the relevant dispatcher's thread with each driver, with the load reference attached.

## Consequences

### Positive

- Threads match how dispatchers and drivers actually talk — continuous conversations, not load-scoped fragments.
- Load context is preserved in messages via reference, not by axis-splitting.
- The unassigned-load case (a load doesn't yet have a driver) no longer needs a special "system" thread — the conversation simply doesn't open until assignment.
- The Tower's "new message" picker offers driver-by-name, not load-by-name. Fewer steps to start a thread.

### Trade-offs

- Existing message rows that were load-keyed needed a migration path. The migration created one canonical thread per (tenant, driver, dispatcher) and moved load-keyed messages into it with the load reference preserved.
- Per-load message history is no longer a SELECT on a load-keyed table — it's a filter over the driver thread by `load_id`.

### Neutral

- The frontend models a single thread per pair; load chips inside messages render the load context. Existing UI affordances (load sheet shows the thread filtered by load) still work via the message-level `load_id`.

## Evidence

- Commits implementing the switch (visible in `git log`):
  - `32817487e feat(messaging): re-key Tower wire to driver-dispatch + seed driver conversations`
  - `5760c138e feat(messaging): re-key load-sheet messaging to driver-keyed model`
  - `5384a9798 feat(messaging): DriverConversationsService`
  - `8226af213 feat(messaging): DriverConversationSummary + per-message loadId types`
  - `54b7e73d3 feat(messaging): driver-conversation constants`
  - `5e153ffed feat(messaging): driver-keyed conversation schema columns`
  - `1c6d4cae1 fix(messaging): re-point load-sheet messaging to the driver-keyed model`
  - `17c6a691e fix(messaging): address review — SSE wiring, tenant scoping, N+1, naming`
  - `c6ba7e271 feat(messaging): new-message driver picker + unassigned-load guard`
- Domain code: `apps/backend/src/domains/fleet/loads/controllers/load-messages.controller.ts`, `apps/backend/src/domains/operations/tower/` (driver-messages services).
- Prisma models added: `DriverConversation`, `DriverConversationMessage` (verify in `schema.prisma`).
