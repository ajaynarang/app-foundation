---
owner: foundation
status: interim
pending: F2
sources:
  - docs/adr/0003-outbox-and-deadlines.md
  - docs/adr/0013-outbound-webhooks.md
  - apps/backend/src/platform-glue/events/event-registry.ts#APP_EVENT_REGISTRY
  - packages/appshore/kernel/src/infrastructure/events/foundation-events.ts
  - packages/appshore/platform/src/infrastructure/events/outbox.service.ts#OutboxService
  - packages/appshore/platform/src/test/mocks/outbox.mock.ts#createMockOutbox
  - apps/backend/src/architecture/no-direct-emit.allowlist.json
  - apps/backend/src/platform-glue/events/__tests__/double-delivery.spec.ts
  - apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts
  - apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts
  - packages/appshore/web-core/src/shared/realtime/invalidation-map.ts
  - apps/backend/src/platform-glue/webhooks
guards:
  - no-direct-emit.spec.ts
  - double-delivery.spec.ts
  - outbox.service.spec.ts
  - event-registry.spec.ts
  - domain-event-sse-bridge.service.spec.ts
  - sse-role-fanout.spec.ts
  - api-contract.spec.ts
examples:
  - DOMAIN_EVENTS.PROJECT_CREATED
---

# Events and the outbox: the registry and naming, emit through the outbox, SSE scope, webhooks

Moved from the old backend skill; condensed with its recipe in its finish pull request. The decision is the ADR
"Outbox and deadlines", `docs/adr/0003-outbox-and-deadlines.md`; the event names a product uses are listed in
`docs/event-vocabulary.md`. Timers are in [`jobs-and-deadlines.md`](jobs-and-deadlines.md).

The shape of a write that raises an event (short, the real calls are in the services that use `OutboxService`):

```typescript
const row = await this.outbox.transaction(async (tx, emit) => {
  const updated = await tx.project.update({ where: { id }, data: { status } });
  await emit(DOMAIN_EVENTS.PROJECT_UPDATED, tenantId, { projectNumber: updated.projectNumber }, actor);
  return updated;
}); // published here, after the commit; a rollback publishes nothing
```

## Rules

### The registry

- An event name is `app.<aggregate>.<past-tense-action>` (`app.project.created`), a fact in the past tense, and is
  listed verbatim in `docs/event-vocabulary.md`. [guard: event-registry.spec.ts]
- A product's events are entries in `APP_EVENT_REGISTRY` (`apps/backend/src/platform-glue/events/event-registry.ts`):
  `key`, `constantName`, `label`, `description`, `category`, `visibility`. `DOMAIN_EVENTS` derives from it, so
  `DOMAIN_EVENTS.PROJECT_CREATED` is the literal type of its key. The foundation's own catalog is in `@appshore/kernel`
  (`foundation-events`). [guard: event-registry.spec.ts]
- Only `visibility: 'external'` events appear in the webhook subscription catalog. [guard: event-registry.spec.ts]
- A new event that should reach the web updates, in the same pull request: the registry, the cache-invalidation
  subscriber (`apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts`), the SSE bridge
  (`apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts`), the SSE event type in
  `packages/shared-types`, and the query keys in `packages/appshore/web-core/src/shared/realtime/invalidation-map.ts`.
  [guard: domain-event-sse-bridge.service.spec.ts]

### The outbox

- An event with a write behind it is raised inside that write's transaction, through
  `OutboxService.transaction((tx, emit) => …)` (`@appshore/platform/infrastructure/events/outbox.service`). `emit`
  writes an `outbox_events` row on `tx`; after the commit the events are published in order through
  `DomainEventService.publish` (the in-process bus, then the durable `events` queue) and the rows are marked published.
  Never `DomainEventService.emit` after the commit, never a raw `EventEmitter2.emit`. [guard: no-direct-emit.spec.ts]
- Publishing never fails the caller. What did not publish (a crash, Redis down) is published by the relay, the
  `outbox-relay` job on `bulk-ops`, every 10 seconds. [guard: outbox.service.spec.ts]
- Every write the event describes is on `tx`, never `this.prisma`. External calls (HTTP, AI, queues) stay out of the
  callback: the transaction is capped at 15 seconds (`OUTBOX_TRANSACTION_TIMEOUT_MAX_MS`). Work that is not part of the
  change (cache busts, notifications) runs after the transaction returns. [guard: outbox.service.spec.ts]
- Code that owns its transaction stages with `outbox.stage(tx, …)` and calls `outbox.publishStaged(events)` after the
  commit; a hot path that must not wait on Redis starts `publishStaged` with `void` (it never throws).
  [guard: outbox.service.spec.ts]
- A signal (an event with no write behind it) may use `DomainEventService.emit` directly only with an entry in
  `apps/backend/src/architecture/no-direct-emit.allowlist.json`: file, count, reason. A change is never a signal.
  [guard: no-direct-emit.spec.ts]
- In unit specs, `createMockOutbox(prisma)` records what was published, and a callback that throws publishes nothing.
  [guard: outbox.service.spec.ts]

### Consumers

- Delivery is at least once: every consumer keys its writes and job ids on `event.id`, or re-reads state before it
  acts. A durable enqueue uses the job id `<event name>-<event id>`; the event log upserts on the event id; outbound
  webhooks reuse one delivery row per event and subscription. A new consumer is added to
  `apps/backend/src/platform-glue/events/__tests__/double-delivery.spec.ts`. [guard: double-delivery.spec.ts]
- A slow listener never runs on the hot path; heavy work goes to the durable processor or its own queue. A listener
  that needs durability (webhooks, audit) subscribes on the durable processor; one that may be lossy (cache busting,
  SSE) lives on the in-process bus. [review-only: needs reading]
- A relayed event fires its in-process listeners in the process that ran the relay, so an SSE client on another process
  sees the change on its next fetch. [review-only: a known limit in the ADR]

### SSE

- The bridge maps domain events to SSE events and decides who receives them: tenant-scoped (default, every connection
  of that tenant) or user-scoped (`recipientUserIds` in the payload, unicast, and stripped before it is serialized).
  Decide the scope first: a tenant-scoped event that carries personal data is a privacy bug.
  [guard: domain-event-sse-bridge.service.spec.ts, sse-role-fanout.spec.ts]
- `SseService.emitToTenant(tenantId, type, data)` broadcasts; `emitToUser(userId, type, data)` unicasts.
  [guard: sse.service.spec.ts]

### Webhooks

- An inbound webhook is `@Public()`, verifies an HMAC-SHA256 signature over `req.rawBody` with
  `crypto.timingSafeEqual`, answers 200 so the vendor does not retry, carries `@Throttle(GENEROUS_THROTTLE)` (never
  `@SkipThrottle()`), and is listed in `PROVIDER_ROUTES` with the vendor document. [guard: api-contract.spec.ts]
- Outbound webhooks (`apps/backend/src/platform-glue/webhooks/`) are subscriptions to event patterns (`app.project.*`),
  delivered on the `webhooks` queue with 3 attempts and backoff, signed per Standard Webhooks (`webhook-id`,
  `webhook-timestamp`, `webhook-signature`; `whsec_…` secrets that rotate with an overlap window), and behind the SSRF
  guard: the URL and every resolved address must be public, checked on save and on the delivery's own connection, no
  redirects. The decision is `docs/adr/0013-outbound-webhooks.md`. [guard: webhook-url.validator.spec.ts]

## Flag in review

- An event emitted after the commit, or with `EventEmitter2`.
- `this.prisma` inside an outbox callback, or an HTTP or AI call in one.
- A new allowlist entry in `no-direct-emit.allowlist.json` for a change, not a signal.
- A consumer that would act twice on a second delivery.
- A tenant-scoped SSE event carrying personal data.
- An inbound webhook without signature verification, or with `@SkipThrottle()`.
