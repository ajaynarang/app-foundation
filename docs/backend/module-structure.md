---
title: Module Structure
description: How the NestJS backend is organized — 14 domain modules, the infrastructure layer, the module template, and where new code goes.
---

# Module Structure

`apps/backend/` is a NestJS 11 application. Source under `src/` divides into three top-level concerns:

| Folder | Purpose |
|---|---|
| `src/domains/` | Feature code — 14 domain modules |
| `src/infrastructure/` | Cross-cutting providers (cache, events, queue, telemetry, logging, sse, storage, sync, notification, push, sms, webhooks, retry, mock) |
| `src/auth/`, `src/architecture/`, `src/shared/` | Auth guard chain, status / health, generic utilities |

The Prisma schema, migrations, and seeds live under `src/prisma/`. The Inngest function entry point is under `src/domains/desk/core/inngest/`.

## The 14 domains

| Domain | Purpose |
|---|---|
| `admin/` | Admin job controls — replay, retry, audit operations |
| `ai/` | Sally AI assistant, document intelligence, MCP server + client, knowledge base, moderation, orchestrator, RLS, voice |
| `analytics/` | Tenant analytics |
| `billing/` | Tenant billing subscriptions, plans, add-on lifecycle |
| `desk/` | Sally's Desk runtime (responsibilities/episodes/steps, approvals, suppression, memory) |
| `financials/` | Invoicing, settlements, payments, close-out, profitability, factoring |
| `fleet/` | Drivers, vehicles, loads, customers, documents, recurring lanes, EDI |
| `home/` | Home-screen widget aggregator |
| `integrations/` | Samsara, QuickBooks, OAuth, EDI, email intake, sync engine, vendor adapters |
| `operations/` | Alerts, command center, Shield (compliance), monitoring, notifications |
| `platform/` | Users, tenants, feature flags, settings, onboarding, API keys, plans, feedback |
| `platform-services/` | Fuel cards, fuel prices, geocoding, mileage, tolls, traffic, weather, platform health |
| `prompting/` | LLM prompt management (Langfuse-style versioning) |
| `routing/` | Route planning, HOS compliance, load mileage |

Add new feature code to the closest domain. New domains are rare — they need product alignment and an updated CLAUDE.md.

## The module template

A domain is one or more NestJS modules. The pattern is consistent across the codebase. Using `fleet/loads/` as the canonical example:

```
domains/fleet/loads/
├── loads.module.ts            @Module({ imports, controllers, providers })
├── controllers/                ← thin classes; multiple are normal
│   ├── loads.controller.ts
│   ├── load-messages.controller.ts
│   ├── tracking.controller.ts
│   ├── customer-loads.controller.ts
│   ├── money-codes.controller.ts
│   └── driver-actions.controller.ts
├── services/                   ← many small services, one concern each
│   ├── loads.service.ts
│   ├── load-events.service.ts
│   ├── load-charges.service.ts
│   ├── load-notes.service.ts
│   ├── load-reversal.service.ts
│   ├── load-leg.service.ts
│   ├── load-tracking.service.ts
│   ├── load-share-link.service.ts
│   ├── customer-load.service.ts
│   ├── load-query.service.ts
│   ├── stop-geocoding.service.ts
│   ├── load-creation.service.ts
│   ├── load-draft.service.ts
│   ├── load-status.service.ts
│   ├── load-assignment.service.ts
│   ├── stop-status.service.ts
│   ├── driver-recommendation.service.ts
│   ├── money-code.service.ts
│   ├── driver-actions.service.ts
│   ├── dispatch-sheet-pdf.service.ts
│   └── dispatch-sheet-email.service.ts
├── dto/                        ← Zod-derived DTOs (often re-exporting from @sally/shared-types)
├── utils/                      ← pure helpers
├── *.constants.ts              ← module-local constants
└── __tests__/                  ← co-located *.spec.ts
```

The `services/` folder is intentionally fragmented. Each service has one concern and can be unit-tested in isolation. A 200-line `LoadsService` is a code smell — split it.

## The module file

Anatomy of `loads.module.ts`:

```ts
import { Module, forwardRef } from '@nestjs/common';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
// … controller imports …
// … service imports …

@Module({
  imports: [EventBusModule, PrismaModule /* + other infra modules as needed */],
  controllers: [LoadsController, LoadMessagesController, /* … */],
  providers: [LoadsService, LoadEventsService, LoadChargesService, /* … */],
  exports: [LoadsService /* whatever other modules need */],
})
export class LoadsModule {}
```

The `imports` line tells you which infrastructure modules this domain uses. The `exports` line tells you which services other modules can consume.

## Controllers

Controllers extend `BaseTenantController` (search the codebase for the class) so they get the resolved `tenant_id` for the request:

```ts
@Controller('desk/responsibilities')
export class DeskResponsibilityController extends BaseTenantController {
  constructor(private readonly responsibilities: DeskResponsibilityService) {
    super();
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const tenantDbId = this.resolveTenantDbId(req);
    return this.responsibilities.list(tenantDbId);
  }
}
```

Validation happens through the `ZodValidationPipe` (configured globally) against DTOs that re-export their schemas from `@sally/shared-types`.

## Services

Services do the work. Single concern, constructor injection, no controller types leaking in. Prisma access via the injected `PrismaService`:

```ts
@Injectable()
export class DeskResponsibilityService {
  private readonly logger = new Logger(DeskResponsibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantDbId: number) {
    return this.prisma.deskResponsibility.findMany({
      where: { tenant_db_id: tenantDbId },
      orderBy: { created_at: 'desc' },
    });
  }
}
```

Snake_case in the Prisma block; camelCase everywhere else.

## Infrastructure modules

The infrastructure layer (`src/infrastructure/`) provides cross-cutting concerns. Most domains will import at least two:

| Module | Provides |
|---|---|
| `PrismaModule` | `PrismaService` — the typed Prisma client |
| `CacheModule` | Redis-backed cache abstraction |
| `EventBusModule` | `DomainEventService` for emitting events |
| `BullModule.registerQueue(...)` (from `@nestjs/bullmq`) | Per-queue injection (use `QUEUE_NAMES` from `infrastructure/queue/queue.constants.ts`) |
| `NotificationModule` | Email / SMS / push fan-out |
| `StorageModule` | S3-backed file storage |
| `OutboundWebhooksModule` | Customer webhook delivery |

Pick what you need; don't import the whole infrastructure layer.

## Adding a new domain

Rare. When you really need one:

1. Get product alignment — a new domain is a substantial structural change.
2. Update CLAUDE.md to add the domain to the table.
3. Create `apps/backend/src/domains/<name>/<name>.module.ts` with the standard shape.
4. Register the module in `apps/backend/src/app.module.ts` (or whatever the root composition root is).
5. Document the domain on this page in a follow-up docs PR.

For everything else, find the closest existing domain and add a module under it.
