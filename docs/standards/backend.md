---
title: Backend Standards
description: NestJS-side rules — tenant scoping, DomainEvent, migrations, scheduled jobs, AI invocation, TDD, dates.
---

# Backend Standards

Rules code review enforces on `apps/backend/` changes. Cross-cutting rules (camelCase, enums, palette, emails) live on [Platform Standards](platform.md).

## Tenant scoping on every domain query

**Rule:** every query touching domain data must filter by `tenant_id` (or `tenant_db_id`, depending on the model). Controllers extend `BaseTenantController` to get the resolved tenant.

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

In services, scope the Prisma query:

```ts
// CORRECT
return this.prisma.load.findMany({
  where: { tenant_db_id: tenantDbId, status: 'DISPATCHED' },
});

// WRONG — leaks across tenants
return this.prisma.load.findMany({ where: { status: 'DISPATCHED' } });
```

For AI-driven SQL (where an LLM constructs predicates), row-level security is enforced at the database. See the `ai/rls/` sub-domain.

## Every emit is a `DomainEvent`

**Rule:** every `eventEmitter.emit(...)` MUST instantiate `new DomainEvent(...)`. Plain objects break wildcard subscribers — the persistence subscriber, the SSE bridge, and the durable-event processor all rely on the class identity.

```ts
// CORRECT
this.events.emit(
  new DomainEvent('load.dispatched', String(tenantDbId), { loadId, driverId }),
);

// WRONG — wildcard subscribers won't see this; the event won't reach the browser via SSE
this.events.emit({
  event: 'load.dispatched',
  tenantId: String(tenantDbId),
  data: { loadId, driverId },
});
```

Event names are hierarchical: `<domain>.<entity>.<action>` (e.g. `load.dispatched`, `invoice.paid`, `desk.episode.completed`). Constants live in `apps/backend/src/infrastructure/events/sally-events.constants.ts`.

Detail: [Backend Guide → Events & Queues](../backend/events-queues.md). Sequence: [Runtime Architecture → Flow 4.2](../architecture/runtime-architecture.md#42-write-domainevent-sse-frontend-invalidation).

## Migrations via `tools/db/migrate.sh`

**Rule:** never run `prisma migrate dev` locally. It uses `db push` drift semantics and will reset mastra-owned tables that Prisma doesn't know about — wiping agent memory and chat history.

```bash
# CORRECT
cd apps/backend
../../tools/db/migrate.sh --env local -y           # full mode: migrate + seed + langfuse seed
../../tools/db/migrate.sh --env local --migrate-only -y   # migrations only
../../tools/db/migrate.sh --env local --status     # read-only status
../../tools/db/migrate.sh --env staging --dry-run  # what would apply on staging

# CORRECT — for an intentional local reset
cd apps/backend && doppler run -- pnpm db:reset
```

```bash
# WRONG — resets mastra tables silently
cd apps/backend && pnpm exec prisma migrate dev
```

For schema changes, use `prisma migrate dev --create-only` to *generate* the migration SQL, but always *apply* it via `tools/db/migrate.sh`.

Detail: [Backend Guide → Database & Prisma](../backend/database-prisma.md).

## Scheduled jobs are DB-driven (no `@Cron`)

**Rule:** the backend does not use `@nestjs/schedule`. Recurring work is database-driven through `ScheduleManagerService` (`apps/backend/src/infrastructure/queue/schedule-manager.service.ts`) backed by the `JobSchedule` Prisma model.

```ts
// CORRECT — insert a JobSchedule row in a migration or seed
await prisma.jobSchedule.create({
  data: {
    category: 'COMPLIANCE',
    job_type: 'shield-hourly-sweep',
    cron_expression: '0 * * * *',
    is_enabled: true,
  },
});
```

```ts
// WRONG — @Cron decorators aren't used in this repo
@Cron('0 * * * *')
async hourlySweep() { ... }
```

Schedules can be enabled / disabled / re-timed at runtime via the admin surface without redeploy. For one-shot delayed work, use BullMQ's `delay` option directly:

```ts
await this.maintenanceQueue.add('trial-expiry', { tenantId }, { delay: msUntilReminder });
```

Detail: [Backend Guide → Scheduled Jobs](../backend/scheduled-jobs.md).

## AI invocation — Mastra default

**Rule:** Mastra agents are the default path for AI invocation. Direct AI SDK calls are permitted only for documented exceptions where the work is workflow-shaped, not agent-shaped.

The documented exceptions (verified):

| File | Reason |
|---|---|
| `apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts` | Document extraction with typed schemas |
| `apps/backend/src/domains/ai/document-intelligence/ratecon/ratecon-parser.service.ts` | Rate-con parsing — uses StructuredOutputService |
| `apps/backend/src/domains/ai/document-intelligence/fuel-receipt/fuel-receipt-parser.service.ts` | Fuel receipt parsing |
| `apps/backend/src/domains/ai/orchestrator/skill-classifier.service.ts` | Picks which agent handles a message (calling an agent to pick an agent is circular) |
| `apps/backend/src/domains/desk/shared-steps/_llm-step.helper.ts` | Desk step helper — one LLM call per step by design |
| `apps/backend/src/domains/platform/feedback/feedback.service.ts` | Feedback classification |

Provider routing is **unconditional** — all AI calls go through the Vercel AI Gateway (configured in `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts`). No fallback bypass.

New AI code is Mastra unless it matches one of the patterns above. When unsure, write the agent first; if it feels over-engineered for a single LLM call, raise it in review.

Detail: [Architecture → AI Stack](../architecture/ai-stack.md), [ADR-013](../architecture/adrs/013-ai-mastra-default-direct-sdk-exceptions.md).

## TDD for services

**Rule:** backend services use TDD. Write the spec first, watch it fail, write the minimum to pass, refactor.

- Test files: `*.spec.ts` co-located with source, or under `<folder>/__tests__/`.
- Mocking pattern: constructor injection + hand-rolled fake class. Not `Test.createTestingModule({...}).compile()` with provider overrides.
- Run: `pnpm backend:test` (full), `pnpm test -- --watch` (watch), `pnpm test:cov` (coverage).

```ts
class FakePrismaService {
  deskAgent = { findUnique: jest.fn(), update: jest.fn() };
}

describe('AgentService.updateAgent', () => {
  let svc: AgentService;
  let prisma: FakePrismaService;
  beforeEach(() => {
    prisma = new FakePrismaService();
    svc = new AgentService(prisma as any);
  });
  // ...
});
```

Intentional skips in `testPathIgnorePatterns` (don't "fix" without checking why): `*.schema.spec.ts`, `sally-ai.service.spec.ts`, `langfuse-prompt.service.spec.ts`, `desk/engine/__tests__/invocation.service.spec.ts`.

Detail: [Backend Guide → Testing](../backend/testing.md).

## Calendar dates vs timestamps

**Rule:** know the difference and use the right type.

**Calendar dates** (`@db.Date` in Prisma) represent a day, no time component:

- TypeScript representation: `string` in `YYYY-MM-DD` format.
- **Never** convert to a `Date` object — it gets a timezone offset and shifts by a day.
- Examples: driver date of birth, settlement period start/end, IFTA quarter start/end.

```ts
// CORRECT — string comparison is safe for YYYY-MM-DD
const dob: string = driver.date_of_birth;  // "1985-03-12"
if (dob < '2000-01-01') { ... }

// WRONG — timezone offset will shift the day
const dobDate = new Date(driver.date_of_birth);
```

**Timestamps** (`@db.Timestamptz`) represent a specific instant — always UTC at rest:

- TypeScript representation: ISO 8601 string when crossing the API boundary; `Date` in service code.
- Examples: when an alert was raised, when a payment cleared.

```ts
// CORRECT
return {
  createdAt: load.created_at.toISOString(),  // "2026-05-20T14:23:11.000Z"
};
```

Detail: [Architecture → Data Model](../architecture/data-model.md#calendar-dates-vs-timestamps).

## Request lifecycle — the standard shape

Every API request passes through this chain. Don't bypass any step:

1. Helmet + CORS.
2. AuthGuard verifies the Firebase JWT and attaches `req.user`.
3. Tenant context (via `BaseTenantController` + middleware) resolves the active tenant into `AsyncLocalStorage`.
4. `ZodValidationPipe` validates the body against the DTO schema.
5. Controller method calls the service.
6. Service does the work, emits `DomainEvent`s if state changed.
7. Response interceptor formats the response (camelCase, headers).

Detail: [Architecture → Backend](../architecture/backend.md), [Runtime Architecture → Flow 4.1](../architecture/runtime-architecture.md#41-authenticated-api-request).

## Review checklist

- [ ] Every domain query filters by `tenant_id` / `tenant_db_id`.
- [ ] Every `emit` wraps in `new DomainEvent(...)`.
- [ ] Migrations applied via `tools/db/migrate.sh`, never `prisma migrate dev`.
- [ ] No `@Cron` / `@Interval` / `@Timeout` decorators added.
- [ ] New AI code goes through Mastra unless it matches a documented exception.
- [ ] New service has a co-located `*.spec.ts`.
- [ ] `@db.Date` fields stay as `YYYY-MM-DD` strings; no `new Date(dateOnly)`.
- [ ] Controllers extend `BaseTenantController`.
- [ ] DTOs use Zod (re-exported from `@sally/shared-types` where possible).
