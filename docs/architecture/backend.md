---
title: Backend Architecture
description: Domain-driven NestJS 11 modules, the request pipeline, multi-tenancy, events, queues, observability.
---

# Backend Architecture

`apps/backend/` is a NestJS 11 application written in TypeScript 5.9. The runtime model: a single process serves HTTP for the API, runs BullMQ workers in the same process, exposes an MCP server for AI tools, hosts Mastra agents, and exposes an Inngest SDK route at `/api/v1/inngest` for Sally's Desk durable workflows.

## Source layout

```
apps/backend/src/
├── domains/                14 domain modules — feature code lives here
│   ├── admin/
│   ├── ai/
│   ├── analytics/
│   ├── billing/
│   ├── desk/
│   ├── financials/
│   ├── fleet/
│   ├── home/
│   ├── integrations/
│   ├── operations/
│   ├── platform/
│   ├── platform-services/
│   ├── prompting/
│   └── routing/
│
├── infrastructure/         Cross-cutting infrastructure providers
│   ├── cache/              Redis-backed cache abstraction
│   ├── database/           PrismaModule + PrismaService
│   ├── events/             DomainEvent class + event bus + durable subscribers
│   ├── logging/            Pino + Pino-Loki transport + request/trace context
│   ├── mock/               Test doubles
│   ├── notification/       Notification routing (email/SMS/push)
│   ├── outbound-webhooks/  Webhook subscription + dispatch
│   ├── push/               Push notification adapters
│   ├── queue/              BullMQ queue constants + schedule manager
│   ├── retry/              Retry policy helpers
│   ├── sms/                SMS adapters (Twilio)
│   ├── sse/                Server-Sent Events bridge from DomainEvent
│   ├── storage/            S3 / file storage
│   ├── sync/               Outbound sync queues
│   ├── telemetry/          OpenTelemetry SDK bootstrap
│   └── webhooks/           Inbound webhook handlers
│
├── auth/                   AuthGuard, Firebase token verification
├── architecture/           Status endpoints + architectural meta-tests
├── shared/                 Generic utilities (uuidv7, math, dates)
├── prisma/                 Prisma schema + seeds + migrations
│   └── schema.prisma       131 models, single source of truth
└── main.ts                 NestJS bootstrap, OTel start, listen on PORT (default 8000; Doppler injects 8001)
```

## The domain table

| Domain | Purpose |
|---|---|
| `admin/` | Admin job control surfaces — replay, retry, audit |
| `ai/` | Sally AI assistant, document intelligence, MCP server, knowledge base, moderation, orchestration, RLS, voice |
| `analytics/` | Tenant analytics |
| `billing/` | Tenant billing subscriptions, plans, add-on lifecycle |
| `desk/` | Sally's Desk — agent runtime: responsibilities, episodes, steps, approvals, memory, suppression. See [Sally's Desk](sally-desk.md) |
| `financials/` | Invoicing, settlements, payments, close-out, profitability, factoring |
| `fleet/` | Drivers, vehicles, loads, customers, documents, recurring lanes |
| `home/` | Home-screen widget aggregator |
| `integrations/` | Samsara, QuickBooks, OAuth, EDI, email intake, sync engine, vendor adapters |
| `operations/` | Alerts, command center, Shield (compliance), monitoring, notifications |
| `platform/` | Users, tenants, feature flags, settings, onboarding, API keys, plans, feedback |
| `platform-services/` | Fuel cards, fuel prices, geocoding, mileage, tolls, traffic, weather, platform health |
| `prompting/` | LLM prompt management (Langfuse-style versioning) |
| `routing/` | Route planning, HOS compliance, load mileage |

## Module pattern

Each domain is one or more NestJS modules. A representative module — `fleet/loads/` — illustrates the convention:

```
fleet/loads/
├── loads.module.ts         imports + controllers + providers
├── controllers/            multiple thin controllers (loads, messages, tracking, customer, money-codes, driver-actions)
├── services/               many small services split by concern
├── dto/                    Zod-derived DTOs (usually re-exported from @sally/shared-types)
├── utils/                  pure helpers
└── __tests__/              co-located *.spec.ts
```

The `services/` folder is intentionally fragmented — `LoadsService`, `LoadEventsService`, `LoadChargesService`, `LoadNotesService`, `LoadReversalService`, `LoadLegService`, `LoadTrackingService`, `LoadShareLinkService`, `LoadQueryService`, `LoadCreationService`, `LoadDraftService`, `LoadStatusService`, `LoadAssignmentService`, and more. Each service has one responsibility and can be unit-tested independently. New work follows this pattern.

See [Backend → Module Structure](../backend/module-structure.md) for the canonical template.

## Request pipeline

A request to the API passes through this chain:

1. **Helmet + CORS** — security headers, CORS validation.
2. **Body parsers** — JSON / form-data.
3. **AuthGuard** — verifies the Firebase JWT (or API key) and attaches `req.user`.
4. **Tenant context** (`BaseTenantController` subclasses + middleware) — resolves the active tenant.
5. **Validation pipe** — ZodValidationPipe checks the body against the DTO schema.
6. **Controller method** — calls into the service.
7. **Service** — orchestrates business logic, talks to Prisma + Redis + queues.
8. **Domain events** — `eventEmitter.emit(new DomainEvent(...))` for cross-domain notification.
9. **Response interceptor** — formats response, sets caching headers.

## Multi-tenancy

`tenant_id` is the master key. Almost every domain model has a `tenant_id` column; Prisma queries always filter by it.

- `BaseTenantController` resolves the tenant ID from the authenticated user and exposes it to handler methods.
- A request-scoped context (`AsyncLocalStorage`-backed) makes `tenantId` available to services that need it without threading it through every call.
- For AI-driven queries (where the LLM constructs SQL fragments), row-level security is enforced at the database — see the `ai/rls/` sub-domain.

## Events

Defined in `apps/backend/src/infrastructure/events/`:

- `domain-event.ts` — the `DomainEvent<T>` class (constructor takes `event`, `tenantId`, `data`, optional `actor`, `correlationId`, `causationId`). Auto-resolves `actor` from `EventContext` when not provided.
- `domain-event.service.ts` — wraps the NestJS `EventEmitter`. Every emit must wrap in `new DomainEvent(...)`. Plain objects break wildcard subscribers.
- `event-persistence.subscriber.ts` — persists every emitted event to the `DomainEventLog` Prisma model.
- `durable-event.processor.ts` — replays via BullMQ on subscriber failure.
- `event-bus.module.ts` — NestJS module that wires this together.
- `event-registry.ts`, `sally-events.constants.ts` — registry of known event names.

The SSE bridge (`apps/backend/src/infrastructure/sse/domain-event-sse-bridge.service.ts`) is a wildcard subscriber that fan-outs domain events to connected web/console clients.

See [Backend → Events & Queues](../backend/events-queues.md).

## Queues (BullMQ)

19 named queues, defined in `apps/backend/src/infrastructure/queue/queue.constants.ts`:

```
DOMAIN_EVENTS · FLEET_PIPELINE · DOCUMENTS · WEBHOOKS · LANES · COMPLIANCE
ACCOUNTING · MAINTENANCE · OAUTH · OPERATIONS · ROUTE_PLAN_PROGRESS
ROUTE_TRACKING_LEGACY · NOTIFICATIONS · EDI · LOAD_BOARD_ALERTS
EMAIL_INTAKE · DESK_TRIGGERS · DESK_SCHEDULER · LOAD_MILEAGE
```

Some queues have structured job names too — see `ACCOUNTING_JOB_NAMES`, `MAINTENANCE_JOB_NAMES` etc. in the same file.

## Scheduled jobs

**Important:** the backend does **not** use `@nestjs/schedule` or `@Cron` decorators. Scheduling is database-driven through `ScheduleManagerService` (`apps/backend/src/infrastructure/queue/schedule-manager.service.ts`) backed by the `JobSchedule` Prisma model. Schedules can be enabled / disabled / re-timed at runtime via the admin surface without redeploy. The service registers each row as a BullMQ repeat job into the appropriate queue.

See [Backend → Scheduled Jobs](../backend/scheduled-jobs.md).

## Observability

- **Tracing:** `apps/backend/src/infrastructure/telemetry/telemetry.ts` initializes the OpenTelemetry SDK with auto-instrumentations for HTTP, Prisma, Redis, and BullMQ. FS and DNS instrumentations are explicitly disabled to reduce noise. Spans export via `OTLPTraceExporter` (HTTP) to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`, defaulting to `http://localhost:4318` (the Tempo OTLP HTTP receiver).
- **Logs:** Pino with the optional `pino-loki` transport (`apps/backend/src/infrastructure/logging/pino-transport.ts`). Loki URL defaults to `http://localhost:3100`. Labels include `service` (from `OTEL_SERVICE_NAME`, default `sally-backend`) and `env` (`NODE_ENV`).
- **Shutdown:** the NestJS shutdown hook calls `shutdownTelemetry()` AFTER the app stops accepting requests, so spans aren't lost when a pod is recycled.

See [Architecture → Observability](observability.md) for what to look at where.

## AI

`apps/backend/src/domains/ai/` hosts the assistant, the MCP server (`mcp-server/`), the MCP client wiring (`mcp/`), document intelligence (`document-intelligence/` — rate-con parsing, fuel-receipt parsing), the knowledge base (RAG over Postgres + pgvector), the agent base classes (`agents/`), the orchestrator, content moderation, and AI infrastructure (`infrastructure/` — provider routing through the Vercel AI Gateway).

See [Architecture → AI Stack](ai-stack.md) for the invocation rule, the documented direct-AI-SDK exceptions, and the provider routing setup.

## Testing

Backend uses TDD per `CLAUDE.md`. Jest config lives in `apps/backend/package.json`:

- Test regex: `*.spec.ts` — co-located with source or under `<folder>/__tests__/`.
- Test environment: `node`.
- Coverage: `pnpm test:cov` from `apps/backend/`.

Intentional `testPathIgnorePatterns`: `*.schema.spec.ts`, `sally-ai.service.spec.ts`, `langfuse-prompt.service.spec.ts`, `desk/engine/__tests__/invocation.service.spec.ts`. These are documented exclusions, not bugs.

The widely-used mocking pattern is constructor injection + a hand-rolled fake class (e.g. `class FakeEpisodeService { … }`), not `Test.createTestingModule({...}).compile()` with provider overrides. See [Backend → Testing](../backend/testing.md).

## Deployment

Backend runs on AWS ECS Fargate. Terraform in `infra/terraform/` is the source of truth for task definitions, IAM, networking. The `Deploy All` GitHub Actions workflow (`workflow_dispatch` only) builds the Docker image, pushes to ECR, then runs `terraform apply` with the new image tag — keeping env vars, secrets, and image always in sync.

Doppler injects production secrets at container start via the `DOPPLER_TOKEN_PRD` token. The same flow applies to staging with `DOPPLER_TOKEN_STG`.
