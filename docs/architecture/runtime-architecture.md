---
title: Runtime Architecture
description: One-page visual reference for how SALLY runs — context, containers, deployment, and the critical sequence flows.
---

# Runtime Architecture

This is the one-page visual reference. Three static views (system context, containers, deployment) then sequence diagrams for the flows you'll trace most often.

Each diagram has a **Source** line — the file paths the picture was drawn from. When the picture stops matching the code, the source line is where you start the refresh.

---

## 1. System context

Who SALLY talks to and who talks to SALLY. Useful when explaining the platform to a partner, a security reviewer, or a new engineer in their first 30 seconds.

```mermaid
flowchart LR
  Dispatcher((Dispatcher))
  Driver((Driver))
  Customer((Customer))
  Admin((Tenant Admin))
  SuperAdmin((Super Admin))

  subgraph SALLY[SALLY platform]
    direction LR
    sallyCore[Web · Console · Backend API]
  end

  Firebase[(Firebase Auth)]
  Twilio[(Twilio<br/>OTP + SMS)]
  Gateway[(Vercel AI Gateway<br/>→ Anthropic / OpenAI / …)]
  Samsara[(Samsara ELD)]
  QBO[(QuickBooks Online)]
  EDI[(EDI partners<br/>via project44 / direct)]
  OSRM[(OSRM / HERE<br/>routing)]
  FuelAPI[(Fuel price APIs)]
  Weather[(Weather APIs)]
  Loki[(Grafana Cloud<br/>Loki + Tempo)]

  Dispatcher --> SALLY
  Driver --> SALLY
  Customer --> SALLY
  Admin --> SALLY
  SuperAdmin --> SALLY

  SALLY <--> Firebase
  SALLY --> Twilio
  SALLY --> Gateway
  SALLY <--> Samsara
  SALLY <--> QBO
  SALLY <--> EDI
  SALLY --> OSRM
  SALLY --> FuelAPI
  SALLY --> Weather
  SALLY --> Loki
```

**Source:** `apps/backend/src/domains/integrations/`, `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts`, `apps/backend/src/domains/platform-services/`.

---

## 2. Containers

What runs inside SALLY and how they connect. This is the "internal organs" diagram — every component a backend or frontend developer touches is here.

```mermaid
flowchart TB
  subgraph Browsers
    Web[Web app<br/>Next.js 15 · :3001]
    Console[Console<br/>Next.js 15 · :3002]
    DriverApp[Driver view<br/>web/driver]
    CustomerApp[Customer portal<br/>web/customer]
  end

  subgraph BackendHost[Backend host process — image runs as 'api' OR 'worker']
    direction TB
    API[NestJS API<br/>HTTP · :8001]
    Workers[BullMQ workers<br/>in-process]
    Schedule[ScheduleManagerService<br/>DB-driven cron]
    Mastra[Mastra agents]
    MCP[MCP server<br/>20+ tools]
    InngestSDK[Inngest SDK route<br/>/api/v1/inngest]
    OTel[OpenTelemetry SDK]
    Pino[Pino logger]
  end

  Postgres[(Postgres 16 + pgvector)]
  Redis[(Redis 7)]
  S3[(S3 — document storage)]
  Inngest[(Inngest<br/>durable workflows)]

  AIGateway[(Vercel AI Gateway)]
  Loki[(Loki)]
  Tempo[(Tempo)]
  Grafana[(Grafana)]

  Web -->|HTTPS · JWT| API
  Console -->|HTTPS · JWT| API
  DriverApp --> Web
  CustomerApp --> Web

  Web <-.->|SSE| API
  Web <-.->|Socket.IO<br/>messaging only| API

  API --> Postgres
  API --> Redis
  Workers --> Postgres
  Workers --> Redis
  Schedule --> Workers
  API --> S3
  Workers --> S3
  API --> Mastra
  Workers --> Mastra
  Mastra --> MCP
  MCP --> API
  Mastra --> AIGateway
  Inngest -->|HTTPS callback| InngestSDK
  InngestSDK --> Mastra

  API -->|OTLP HTTP :4318| Tempo
  Workers -->|OTLP HTTP :4318| Tempo
  Pino --> Loki
  Tempo --> Grafana
  Loki --> Grafana
```

**Notes:**

- `api` and `workers` are the **same Docker image** but run as two ECS services with different commands. API serves HTTP; workers run BullMQ + scheduled jobs.
- MCP server runs inside the backend process and is also called by Mastra inline (no network hop for tool invocations).
- Inngest is external — the backend exposes a callback URL Inngest hits.
- Observability (Loki + Tempo + Grafana) is opt-in locally and managed in production.

**Source:** `infra/terraform/ecs.tf` (api + worker task definitions), `apps/backend/src/domains/ai/sally-ai/mastra/`, `apps/backend/src/domains/ai/mcp-server/`, `apps/backend/src/domains/desk/core/inngest/inngest.controller.ts`, `apps/backend/src/infrastructure/telemetry/telemetry.ts`, `apps/backend/src/infrastructure/logging/pino-transport.ts`.

---

## 3. Deployment topology

Where each container actually runs in production.

```mermaid
flowchart TB
  subgraph GitHub[GitHub Actions]
    Deploy[Deploy All / Deploy Frontend<br/>workflow_dispatch]
  end

  subgraph Vercel
    WebProj[sally-web project]
    ConsoleProj[sally-console project]
  end

  subgraph AWS[AWS account]
    subgraph VPC
      ALB[ALB · ACM cert<br/>HTTPS :443]
      subgraph Fargate[ECS Fargate cluster]
        APIService[Service: api]
        WorkerService[Service: worker]
      end
      RDS[(RDS Postgres 16<br/>+ pgvector)]
      EC[(ElastiCache Redis<br/>replication group)]
    end
    S3[(S3 — cdn bucket)]
    CF[CloudFront distribution]
    ECR[(ECR — backend image)]
    SSM[(SSM Parameter Store<br/>doppler token + secrets)]
    CW[(CloudWatch Logs)]
    IAM[OIDC role for GitHub<br/>+ execution + task roles]
  end

  Doppler[(Doppler<br/>dev · stg · prd configs)]
  GrafanaCloud[(Grafana Cloud<br/>Loki + Tempo)]
  Inngest[(Inngest)]

  Users((Users)) --> CF
  Users --> ALB
  Users --> WebProj
  Users --> ConsoleProj

  CF --> S3

  ALB --> APIService
  APIService --> RDS
  APIService --> EC
  APIService --> S3
  WorkerService --> RDS
  WorkerService --> EC
  WorkerService --> S3

  APIService -.->|callback URL| Inngest
  WorkerService -.->|callback URL| Inngest

  WebProj --> ALB
  ConsoleProj --> ALB

  Deploy -->|docker build + push| ECR
  Deploy -->|terraform apply| Fargate
  Deploy -->|deploy hook| WebProj
  Deploy -->|deploy hook| ConsoleProj

  Doppler -.->|injects at start| Fargate
  Doppler -.->|injects at start| WebProj
  Doppler -.->|injects at start| ConsoleProj

  SSM --> Fargate
  IAM --> Fargate
  IAM --> Deploy
  Fargate --> CW
  Fargate --> GrafanaCloud
```

**Notes:**

- Backend lives on AWS (ECS Fargate); frontend on Vercel. Both deploys are triggered manually via GitHub Actions (`workflow_dispatch` — no automatic git-push deploy).
- `api` and `worker` are two ECS services from the same image, sharing RDS, ElastiCache, and S3.
- Doppler injects secrets at container start in every environment.
- Vercel uses **deploy hooks** from the workflow — `vercel.json` has `deploymentEnabled: false` to disable git auto-deploy.
- Observability ships to Grafana Cloud in production; locally it's the opt-in Docker profile.

**Source:** `infra/terraform/{ecs,rds,elasticache,alb,cdn,s3,ecr,iam,doppler,cloudwatch}.tf`, `.github/workflows/deploy-all.yml`, `.github/workflows/deploy-frontend.yml`, `vercel.json`, `apps/web/vercel.json`, `apps/console/vercel.json`.

---

## 4. Sequence flows

Six flows — the critical ones every backend developer ends up tracing. Each is a self-contained Mermaid block; read whichever you need.

### 4.1 Authenticated API request

A dispatcher clicks "dispatch this load" in the web app. This is the request shape every endpoint follows.

```mermaid
sequenceDiagram
  participant Browser
  participant Web as Web (Next.js)
  participant ALB
  participant API as NestJS API
  participant Guard as AuthGuard + Tenant Context
  participant Ctrl as LoadsController
  participant Svc as LoadsService
  participant PG as Postgres (Prisma)

  Browser->>Web: click "Dispatch"
  Web->>ALB: POST /api/v1/loads/:id/dispatch<br/>Bearer <Firebase JWT>
  ALB->>API: forward
  API->>Guard: AuthGuard
  Guard->>Guard: verify Firebase JWT
  Guard->>Guard: resolve user → resolve tenantDbId
  Guard->>API: AsyncLocalStorage{ actor, tenantDbId }
  API->>Ctrl: dispatch(id)
  Ctrl->>Ctrl: ZodValidationPipe (DTO)
  Ctrl->>Svc: dispatch(tenantDbId, loadId, driverId)
  Svc->>PG: update load WHERE tenant_id = $1
  PG-->>Svc: row
  Svc-->>Ctrl: camelCase response
  Ctrl-->>API: 200 OK
  API-->>Web: JSON
  Web-->>Browser: UI updates
```

**What this shows:** the camelCase boundary (Prisma takes snake_case, the response is camelCase), `tenantDbId` resolved by the guard chain not the controller, validation as a pipe.

**Source:** `apps/backend/src/auth/`, `apps/backend/src/shared/base/base-tenant.controller.ts`, `apps/backend/src/infrastructure/events/event-context.interceptor.ts`, any controller under `apps/backend/src/domains/fleet/loads/controllers/`.

### 4.2 Write → DomainEvent → SSE → frontend invalidation

The same dispatch action, continued. **This is the spine of how real-time works in SALLY.**

```mermaid
sequenceDiagram
  participant Svc as LoadsService
  participant Bus as DomainEventService<br/>(EventEmitter2)
  participant Persist as EventPersistenceSubscriber
  participant SSEBridge as DomainEventSseBridge
  participant Redis
  participant SSE as SSE endpoint<br/>/api/v1/sse/events
  participant Browser
  participant Map as invalidation-map.ts
  participant TQ as TanStack Query

  Svc->>Bus: emit(new DomainEvent('load.dispatched', tenantId, payload))
  par persistence
    Bus->>Persist: subscribe (wildcard)
    Persist->>Persist: write DomainEventLog row
  and SSE fan-out
    Bus->>SSEBridge: subscribe (wildcard)
    SSEBridge->>Redis: PUBLISH tenant:{id}:events
    Redis->>SSE: SUBSCRIBE message
    SSE->>Browser: event: load.dispatched\ndata: {...}
    Browser->>Map: onmessage(eventName)
    Map->>TQ: invalidateQueries(queryKeys.loads.root)
    TQ->>TQ: refetch loads list
  end
```

**What this shows:** one emit fans out to three things — durable log, SSE to browsers in the same tenant, and (if registered) BullMQ-backed durable subscribers. The wildcard subscriber rule matters here: a plain-object emit would skip both `Persist` and `SSEBridge`.

**Source:** `apps/backend/src/infrastructure/events/{domain-event.ts,event-bus.module.ts,event-persistence.subscriber.ts}`, `apps/backend/src/infrastructure/sse/domain-event-sse-bridge.service.ts`, `apps/web/src/shared/realtime/{sse-bus.ts,sse-context.tsx,invalidation-map.ts}`.

### 4.3 AI agent invocation (Mastra + MCP)

User asks Sally a question. Mastra picks an agent, the model returns a tool call, MCP executes against the domain layer, the answer comes back. This is where AI Gateway, MCP, and the domain code meet.

```mermaid
sequenceDiagram
  participant Browser
  participant ChatCtrl as SallyAIController
  participant Mastra as Mastra Agent<br/>(e.g. sally-billing)
  participant Gateway as Vercel AI Gateway
  participant Model as Claude (selected via Gateway)
  participant MCP as MCP server (in-process)
  participant Svc as Domain service<br/>(e.g. InvoiceService)
  participant PG as Postgres

  Browser->>ChatCtrl: POST /api/v1/ai/sally/chat<br/>{ message: "what invoices are overdue?" }
  ChatCtrl->>Mastra: agent.generate(messages, tools)
  Mastra->>Gateway: generateText({ model, tools })
  Gateway->>Model: complete
  Model-->>Gateway: { toolCall: list_overdue_invoices, args }
  Gateway-->>Mastra: tool call
  Mastra->>MCP: invoke(list_overdue_invoices, args, ctx{tenantId})
  MCP->>Svc: listOverdueInvoices(tenantDbId)
  Svc->>PG: SELECT ... WHERE tenant_id = $1 AND status = 'OVERDUE'
  PG-->>Svc: rows
  Svc-->>MCP: camelCase result
  MCP-->>Mastra: tool result
  Mastra->>Gateway: generateText({ history + toolResult })
  Gateway->>Model: complete
  Model-->>Gateway: final answer
  Gateway-->>Mastra: text
  Mastra-->>ChatCtrl: { messages, agentInvocationLogId }
  ChatCtrl-->>Browser: response
  Note over ChatCtrl,PG: AgentInvocationLog written for audit
```

**What this shows:** the Gateway is the only path to the model (no provider SDK bypass). MCP tools are in-process function calls, not network calls. Every tool execution respects the active tenant via the context the MCP server passes down.

**Source:** `apps/backend/src/domains/ai/sally-ai/`, `apps/backend/src/domains/ai/sally-ai/mastra/mastra.provider.ts`, `apps/backend/src/domains/ai/mcp-server/`, `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts`.

### 4.4 Inngest-backed Desk episode

A scheduled responsibility — currently AR follow-up — fires, runs through steps, and either resolves or escalates to a supervisor. This is what makes the Desk runtime durable: each step is a checkpoint, retries are automatic, and a deploy mid-episode doesn't lose state.

```mermaid
sequenceDiagram
  participant Trigger as ScheduleManagerService<br/>or DomainEvent
  participant Queue as DESK_TRIGGERS (BullMQ)
  participant Worker
  participant Inngest
  participant SDK as Inngest SDK route<br/>/api/v1/inngest
  participant Fn as arFollowupFunction
  participant Svc as AR domain services
  participant Step as DeskStepWriter
  participant Approval as Supervisor

  Trigger->>Queue: enqueue 'desk.ar_followup.run' job
  Queue->>Worker: dispatch
  Worker->>Inngest: send event sally/desk.ar_followup.run
  Inngest->>SDK: POST /api/v1/inngest (signed)
  SDK->>Fn: invoke arFollowupFunction(event)
  Fn->>Svc: step "fetchOverdueInvoices"
  Svc-->>Fn: result
  Fn->>Step: persist DeskEpisodeStep
  Fn->>Svc: step "draftFollowupMessage" (LLM call)
  Svc-->>Fn: draft
  Fn->>Step: persist DeskEpisodeStep
  alt policy: needs approval
    Fn->>Approval: create DeskApproval
    Approval-->>Fn: approved
  end
  Fn->>Svc: step "sendMessage"
  Svc-->>Fn: result
  Fn->>Step: persist DeskEpisodeStep
  Fn-->>SDK: episode complete
  SDK-->>Inngest: 200 OK
```

**What this shows:** each `step` is one durable checkpoint. If the backend restarts between steps 2 and 3, Inngest replays from step 3 — not from scratch. Approvals pause the episode until a supervisor action arrives via the API.

**Source:** `apps/backend/src/domains/desk/core/inngest/{inngest.controller.ts,inngest.client.ts}`, `apps/backend/src/domains/desk/responsibilities/ar-followup/workflow/ar-followup.function.ts`, `apps/backend/src/infrastructure/queue/schedule-manager.service.ts`.

### 4.5 OAuth connect (a vendor like QuickBooks)

An admin clicks "Connect QuickBooks." The OAuth dance, with the redirect coming back to a public endpoint.

```mermaid
sequenceDiagram
  participant Admin
  participant Web
  participant API as OAuthController
  participant AuthSvc as AuthTokenService
  participant Vendor as Vendor OAuth (e.g. Intuit)
  participant PG as Postgres

  Admin->>Web: click "Connect QuickBooks"
  Web->>API: GET /api/v1/integrations/oauth/quickbooks/connect
  API->>AuthSvc: getConnectUrl(vendor, tenantDbId)
  AuthSvc->>AuthSvc: build OAuth URL with state=tenantDbId
  AuthSvc-->>API: { authorizationUrl }
  API-->>Web: { authorizationUrl }
  Web->>Vendor: redirect (browser)
  Admin->>Vendor: approve
  Vendor->>API: GET /api/v1/integrations/oauth/callback?code=...&state=...
  Note over API: @Public — vendor browser-redirects here<br/>without a SALLY JWT
  API->>AuthSvc: handleCallback(code, state)
  AuthSvc->>Vendor: POST /token { code }
  Vendor-->>AuthSvc: { access_token, refresh_token, expires_in }
  AuthSvc->>PG: upsert IntegrationConfig (tokens encrypted)
  AuthSvc-->>API: success
  API-->>Web: redirect to /admin/integrations
```

**What this shows:** the callback is `@Public` because the vendor's browser redirect doesn't carry a SALLY JWT. State carries the `tenantDbId` so the callback can scope correctly. Tokens are stored encrypted in `IntegrationConfig`.

**Source:** `apps/backend/src/domains/integrations/oauth/{oauth.controller.ts,auth-token.service.ts}`, `apps/backend/src/domains/integrations/vendor-registry.ts`.

### 4.6 Inbound webhook (QuickBooks CDC)

A change happens in QuickBooks. Intuit calls our webhook. We verify the signature, enqueue a sync job, return immediately, and process asynchronously.

```mermaid
sequenceDiagram
  participant Intuit as Intuit (QBO)
  participant API as AccountingWebhookController<br/>POST /accounting/webhook
  participant Verify as Signature verify<br/>(intuit-signature + verifier token)
  participant Queue as ACCOUNTING (BullMQ)
  participant Worker
  participant Adapter as QuickBooksAdapter
  participant PG as Postgres
  participant Bus as DomainEventService

  Intuit->>API: POST /api/v1/accounting/webhook<br/>X-Intuit-Signature
  API->>Verify: verify(rawBody, signature, verifierToken)
  alt invalid
    Verify-->>API: false
    API-->>Intuit: 401 Unauthorized
  else valid
    Verify-->>API: true
    API->>Queue: enqueue 'webhook-payment' job
    API-->>Intuit: 200 OK (immediate)
    Queue->>Worker: dispatch
    Worker->>Adapter: fetchChangedEntities(...)
    Adapter->>PG: upsert payments / invoices
    Worker->>Bus: emit DomainEvent('invoice.paid', ...)
    Note over Bus: triggers SSE fan-out as in flow 4.2
  end
```

**What this shows:** webhook handlers acknowledge fast (200 OK) and do the actual work on a queue. Signature verification is mandatory and happens in the controller before anything else.

**Source:** `apps/backend/src/domains/integrations/accounting/controllers/accounting-webhook.controller.ts`, `apps/backend/src/domains/integrations/accounting/`, `apps/backend/src/infrastructure/queue/queue.constants.ts`.

---

## What's not on this page

- **Per-domain business logic.** This page is the shape. Domain pages (see [Backend Architecture](backend.md)) cover what each service does.
- **Schema-level data structure.** [Data Model](data-model.md) covers the 131 Prisma models.
- **The full AI stack rules and exceptions.** [AI Stack](ai-stack.md) has the Mastra-default rule plus the documented direct-AI-SDK exceptions.
- **The Desk vocabulary and runtime model.** [Sally's Desk](sally-desk.md).
- **The observability "what to look at for what" reference.** [Observability](observability.md).

## Further reading

- [System Overview](index.md) — the brief written summary that complements these diagrams.
- [Backend Architecture](backend.md) — module-by-module breakdown.
- [Frontend Architecture](frontend.md) — App Router, state stack, real-time wiring.
- [Backend → Events & Queues](../backend/events-queues.md) — DomainEvent + BullMQ in detail.
