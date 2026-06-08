---
title: Events & Queues
description: DomainEvent class, the wildcard subscriber rule, BullMQ queue layout, durable subscribers, the SSE bridge.
---

# Events & Queues

SALLY uses domain events as the spine for cross-domain communication. The same event class powers in-process subscribers, the SSE bridge to the frontend, durable persistence to `DomainEventLog`, and durable retries via BullMQ.

## The `DomainEvent` class

Defined in `apps/backend/src/infrastructure/events/domain-event.ts`:

```ts
export class DomainEvent<T = unknown> {
  readonly id: string;            // uuid v7 — monotonic, sortable
  readonly timestamp: Date;
  readonly version: number;       // schema version of the event payload (currently 1)
  readonly actor: EventActor | undefined;  // auto-resolved from EventContext if not provided

  constructor(
    public readonly event: string,         // event name, e.g. 'load.created'
    public readonly tenantId: string,
    public readonly data: T,
    actor?: EventActor,
    public readonly correlationId?: string,
    public readonly causationId?: string,
  ) { /* … */ }
}
```

## The wildcard rule (non-negotiable)

**Every `eventEmitter.emit(...)` MUST instantiate `new DomainEvent(...)`. Plain objects break wildcard subscribers.**

Wildcard subscribers (e.g. the SSE bridge, the persistence subscriber) rely on the class identity to do their job. Pass a plain object and they will silently fail to dispatch.

```ts
// CORRECT
this.eventBus.emit(
  new DomainEvent(
    'load.dispatched',
    String(tenantDbId),
    { loadId, driverId },
  ),
);

// WRONG — plain object. Wildcard subscribers won't see this.
this.eventBus.emit({
  event: 'load.dispatched',
  tenantId: String(tenantDbId),
  data: { loadId, driverId },
});
```

## Emitting

Inject `DomainEventService` (`apps/backend/src/infrastructure/events/domain-event.service.ts`) into the service that's making the state change:

```ts
@Injectable()
export class LoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async dispatch(tenantDbId: number, loadId: string, driverId: string) {
    await this.prisma.load.update({
      where: { id: loadId },
      data: { status: 'DISPATCHED', driver_id: driverId },
    });

    this.events.emit(
      new DomainEvent('load.dispatched', String(tenantDbId), {
        loadId,
        driverId,
      }),
    );
  }
}
```

Don't await `events.emit` — it's synchronous fan-out. Async work happens in subscribers.

## Event names

Keep names hierarchical: `<domain>.<entity>.<action>`. Examples in the codebase:

- `load.created`, `load.dispatched`, `load.delivered`, `load.cancelled`
- `invoice.created`, `invoice.paid`, `invoice.voided`
- `desk.episode.started`, `desk.episode.completed`, `desk.episode.approved`
- `driver.assignment.changed`

Constants live in `apps/backend/src/infrastructure/events/sally-events.constants.ts`. Add new event names there so they're greppable.

## Subscribing in-process

Use the NestJS `@OnEvent` decorator. For wildcards, use the same string with a wildcard.

```ts
@Injectable()
export class LoadStatusBroadcaster {
  @OnEvent('load.dispatched')
  async onDispatched(event: DomainEvent<{ loadId: string; driverId: string }>) {
    // … do something …
  }
}

// Wildcard — every load event
@Injectable()
export class LoadActivityRecorder {
  @OnEvent('load.*')
  async onAnyLoadEvent(event: DomainEvent) {
    // … receives every load.* event …
  }
}
```

## Built-in subscribers

These ship with `EventBusModule`:

| Subscriber | What it does |
|---|---|
| `EventPersistenceSubscriber` | Wildcard subscriber — persists every emitted event to the `DomainEventLog` Prisma model. Source of truth for audit. |
| `DomainEventSseBridge` (in `infrastructure/sse/`) | Wildcard subscriber — fan-outs events to connected SSE clients for the matching tenant. The frontend listens with `useSseEvent` and routes invalidation through `shared/realtime/invalidation-map.ts`. |
| `DurableEventProcessor` | Replays failed durable subscribers via BullMQ. |

## Durable subscribers

For subscribers that **must** run (e.g. emitting an outbound webhook, writing to an external system), wrap the work in a BullMQ job. The pattern: the in-process subscriber pushes a job; a separate BullMQ processor does the actual work; if the processor throws, BullMQ retries it.

The infrastructure already has the wiring — see `apps/backend/src/infrastructure/events/durable-event.processor.ts` and `durable-event.types.ts`. New durable consumers register against the `DOMAIN_EVENTS` queue.

## BullMQ queues

Queue names are in `apps/backend/src/infrastructure/queue/queue.constants.ts`:

```
DOMAIN_EVENTS · FLEET_PIPELINE · DOCUMENTS · WEBHOOKS · LANES · COMPLIANCE
ACCOUNTING · MAINTENANCE · OAUTH · OPERATIONS · ROUTE_PLAN_PROGRESS
ROUTE_TRACKING_LEGACY · NOTIFICATIONS · EDI · LOAD_BOARD_ALERTS
EMAIL_INTAKE · DESK_TRIGGERS · DESK_SCHEDULER · LOAD_MILEAGE
```

Some queues also have structured **job names** (e.g. `ACCOUNTING_JOB_NAMES` includes `INVOICE`, `SETTLEMENT`, `PAYMENT`, `SETTLEMENT_PAYMENT`, `WEBHOOK_PAYMENT`, `WEBHOOK_BILL_PAYMENT`, `INITIAL_SYNC`). Use the constants — never typo a queue or job name as a string literal.

## Registering a queue in a module

```ts
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.MAINTENANCE })],
  providers: [PlansService],
})
export class PlansModule {}

@Injectable()
export class PlansService {
  constructor(
    @InjectQueue(QUEUE_NAMES.MAINTENANCE)
    private readonly maintenanceQueue: Queue,
  ) {}

  async scheduleTrialExpiry(tenantDbId: number) {
    await this.maintenanceQueue.add('trial-expiry', { tenantDbId }, { delay: 0 });
  }
}
```

## Writing a processor

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(QUEUE_NAMES.MAINTENANCE)
export class MaintenanceProcessor extends WorkerHost {
  async process(job: Job) {
    switch (job.name) {
      case 'trial-expiry':
        return this.handleTrialExpiry(job.data);
      // …
    }
  }

  private async handleTrialExpiry(data: { tenantDbId: number }) {
    // … work …
  }
}
```

Processors live in the same domain as the queue. Each is registered as a provider in the domain module.

## Scheduled jobs

The backend **does not use `@nestjs/schedule`**. Recurring work is database-driven through `ScheduleManagerService` — see [Scheduled Jobs](scheduled-jobs.md).

## What the frontend sees

Every emitted event is reflected to connected SSE clients (when there are any) for the matching tenant. The frontend's `shared/realtime/invalidation-map.ts` maps event names to TanStack Query cache invalidations:

```ts
// frontend invalidation map sketch
const map = {
  'load.dispatched': [queryKeys.loads.root],
  'invoice.paid': [queryKeys.invoices.root, queryKeys.financials.root],
  // ...
};
```

So a backend `load.dispatched` event triggers TanStack Query to refetch any open `loads.*` query — the dispatcher's board updates without a polling loop.
