---
owner: foundation
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
  - apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts#DOMAIN_TO_SSE
  - packages/shared-types/src/infrastructure/sse-events.ts#SSE_EVENTS
  - apps/backend/src/domains/ai/routing/connect/ai-credential-connect.service.ts#emitCredentialEvent
  - docs/event-vocabulary.md
  - packages/appshore/web-core/src/shared/realtime/invalidation-map.ts
  - apps/backend/src/platform-glue/webhooks
guards:
  - event-vocabulary.spec.ts
  - no-direct-emit.spec.ts
  - double-delivery.spec.ts
  - outbox.service.spec.ts
  - event-registry.spec.ts
  - domain-event-sse-bridge.service.spec.ts
  - sse-role-fanout.spec.ts
  - api-contract.spec.ts
  - sse.service.spec.ts
  - webhook-url.validator.spec.ts
examples:
  - DOMAIN_EVENTS.PROJECT_CREATED
---

# Events and the outbox: the registry and naming, emit through the outbox, SSE scope, webhooks

A domain event exists if and only if the write behind it committed, and every consumer survives a second delivery.
The decision is the ADR "Outbox and deadlines", `docs/adr/0003-outbox-and-deadlines.md`; the event names are listed in
`docs/event-vocabulary.md`. Timers are in [`jobs-and-deadlines.md`](jobs-and-deadlines.md).

## Rules

### The registry

- An event key is `app.<aggregate>.<action>` in lowercase kebab-case (`/^app\.[a-z0-9-]+\.[a-z0-9-]+$/`), every key
  and constant name unique. [guard: event-registry.spec.ts]
- The action is a fact in the past tense (`app.ai.credential-connected`, `app.api-key.revoked`), never a command.
  [review-only: tense needs reading]
- Every registered key is listed verbatim, in backticks, in `docs/event-vocabulary.md`, with what it means.
  [guard: event-vocabulary.spec.ts]
- A product's events are entries in `APP_EVENT_REGISTRY` (`apps/backend/src/platform-glue/events/event-registry.ts`):
  `key`, `constantName`, `label`, `description`, `category`, `visibility`, `aggregateType`. `DOMAIN_EVENTS` derives
  from it, so `DOMAIN_EVENTS.PROJECT_CREATED` is the literal type of its key. The foundation's own catalog is in
  `@appshore/kernel` (`foundation-events`); a product never adds to it. [guard: event-registry.spec.ts]
- A payload carries public ids (`credentialPublicId`), never an `Int` key, and never a secret. The API key events
  still carry the key's numeric id (the API key exception the ADR "ID boundary" records).
  [review-only: `id-boundary.spec.ts` reads DTOs, route params, tools and shared schemas, not payloads]
- Only `visibility: 'external'` events appear in the webhook subscription catalog. [guard: event-registry.spec.ts]
- A new event that should reach the web updates, in the same pull request: the registry, the cache-invalidation
  subscriber (`apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts`), the bridge's `DOMAIN_TO_SSE`
  (`apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts`), the SSE type in `SSE_EVENTS`
  (`packages/shared-types/src/infrastructure/sse-events.ts`), and its query keys in
  `packages/appshore/web-core/src/shared/realtime/invalidation-map.ts`.
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

## Recipe: emit an event

Copied from `apps/backend/src/domains/ai/routing/connect/ai-credential-connect.service.ts` (`connectKey`): the row
and its two events commit together, and the payload names the credential by its public id.

```typescript
const row = await this.outbox.transaction(async (tx, emit) => {
  const saved = await tx.aiCredential.create({
    data: { publicId, tenantId, type, status: AiCredentialStatus.ACTIVE /* ... */ },
  });
  await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_CONNECTED, saved, actor);
  await emitCredentialEvent(emit, DOMAIN_EVENTS.AI_CREDENTIAL_VALIDATED, saved, actor);
  return saved;
}); // published after the commit; a rollback publishes nothing

function emitCredentialEvent(emit: OutboxEmit, event: string, row: AiCredential, actor: EventActor): Promise<void> {
  return emit(event, row.tenantId, { credentialPublicId: row.publicId, type: row.type }, actor);
}
```

Its registry entry (in the foundation catalog; a product's goes in `APP_EVENT_REGISTRY`), from
`packages/appshore/kernel/src/infrastructure/events/foundation-events.ts`:

```typescript
{
  key: 'app.ai.credential-connected',
  constantName: 'AI_CREDENTIAL_CONNECTED',
  label: 'AI Credential Connected',
  description: "A workspace connected its own AI provider key: a test call passed and the key is stored encrypted. Carries the credential's public id and type, never the key.",
  category: 'AI',
  visibility: 'external' as const,
  aggregateType: 'ai-credential',
},
```

1. Add the entry to `APP_EVENT_REGISTRY`; decide `visibility` (external is a public wire change: it reaches webhooks).
2. Add its row to `docs/event-vocabulary.md` under "Your product": the key, the visibility, what it means.
3. Inject `OutboxService`; do the write and `emit` inside `this.outbox.transaction((tx, emit) => …)`, every write on
   `tx`, no outside call in the callback; cache busts and notifications after it returns.
4. If the web must refresh: map it in `DOMAIN_TO_SSE` (tenant or user scope), add the `SSE_EVENTS` type, the query keys
   in the invalidation map, and the cache keys in the cache-invalidation subscriber.
5. A new consumer keys on `event.id` and gets a case in `double-delivery.spec.ts`.
6. In the service spec, use `createMockOutbox(prisma)` and assert what was published; run `pnpm verify:arch`.

## Flag in review

- An event emitted after the commit, or with `EventEmitter2`.
- `this.prisma` inside an outbox callback, or an HTTP or AI call in one.
- A new allowlist entry in `no-direct-emit.allowlist.json` for a change, not a signal.
- A consumer that would act twice on a second delivery.
- A tenant-scoped SSE event carrying personal data.
- A new event with no row in `docs/event-vocabulary.md`, or an `Int` key in a payload.
- An inbound webhook without signature verification, or with `@SkipThrottle()`.
