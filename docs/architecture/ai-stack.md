---
title: AI Stack
description: AI SDK + Mastra agents + MCP + Vercel AI Gateway + Inngest. The Mastra-default invocation rule and its documented exceptions.
---

# AI Stack

SALLY's AI surface is built on five primitives. Each has a job, and the rule for when to reach for each is settled — see [Invocation Rule](#invocation-rule) below.

## The primitives

| Primitive | Role | Source |
|---|---|---|
| **Vercel AI SDK** (`ai` ^6.0) | Low-level model interface — `generateText`, `streamText`, `generateObject` | `apps/backend/package.json` |
| **Mastra** (`@mastra/core` ^1.4) | Agent framework. Agents are identified by string keys (e.g. `sally-billing`, `sally-alert-briefing`). | `apps/backend/src/domains/ai/sally-ai/mastra/mastra.provider.ts` |
| **MCP** | Model Context Protocol — both server (our 20+ tools) and client (external MCP integrations) | `apps/backend/src/domains/ai/mcp-server/` (server), `apps/backend/src/domains/ai/mcp/` (client) |
| **Vercel AI Gateway** | Provider routing + unified API for model fallback and observability. **Default** for AI calls. | `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts` |
| **Inngest** (^4.2) | Durable workflow engine for Sally's Desk — episodes and steps run on Inngest. Local dev: `pnpm inngest:dev` (or auto-started via `docker-compose up -d`, UI on `:8288`). | `apps/backend/src/domains/desk/core/inngest/` |

## How they fit

```mermaid
flowchart LR
  subgraph Backend
    Caller[Service / Controller]
    Agent[Mastra Agent<br/>e.g. sally-billing]
    SDK[Vercel AI SDK<br/>generateText/Object/streamText]
    Provider[ai-provider.ts<br/>gateway('anthropic/claude-haiku-4.5')]
  end
  Gateway[Vercel AI Gateway]
  Models[Anthropic / OpenAI / others]
  MCPServer[MCP Server<br/>20+ tools]

  Caller -- "the default path" --> Agent
  Agent --> SDK
  SDK --> Provider
  Provider --> Gateway
  Gateway --> Models

  Agent -. tool calls .-> MCPServer
  MCPServer -. domain methods .-> Caller

  Caller -. "documented exceptions only" .-> SDK
```

## Invocation rule

**Default:** Mastra agents.

**Documented exceptions** — places where the codebase calls the AI SDK directly because the work is workflow-shaped, not conversation-shaped:

| File | Reason |
|---|---|
| `apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts` | Document extraction — needs a typed schema-conformant output |
| `apps/backend/src/domains/ai/document-intelligence/ratecon/ratecon-parser.service.ts` | Rate confirmation parsing — uses StructuredOutputService |
| `apps/backend/src/domains/ai/document-intelligence/fuel-receipt/fuel-receipt-parser.service.ts` | Fuel receipt parsing — same shape |
| `apps/backend/src/domains/ai/orchestrator/skill-classifier.service.ts` | Lightweight classification — picks which agent should handle an inbound user message |
| `apps/backend/src/domains/desk/shared-steps/_llm-step.helper.ts` | Desk step helper — a step is one LLM call inside an episode, deliberately not a full agent |
| `apps/backend/src/domains/platform/feedback/feedback.service.ts` | Feedback classification |

Plus the `apps/backend/src/domains/ai/agents/base.agent.ts` file, which IS the agent base class — that's not an exception, that's where Mastra is used.

**New code should go through Mastra unless it fits one of the above patterns.** If you're unsure, write the agent first; if the agent feels over-engineered for what's actually a single LLM call, ask in review and consider an exception.

## Provider routing

`apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts` is the single place that maps logical model names to Gateway-routed providers:

```ts
// Sketch — see the file for the real config
gateway('anthropic/claude-haiku-4.5')
gateway('anthropic/claude-sonnet-4.6')
gateway('anthropic/claude-opus-4.6')
```

The Gateway routes to the configured providers (our Anthropic BYOK key by default), handles rate-limit fallbacks, and gives us a single billing surface. The provider file's comments explain why we pin specific providers per model — without the pin, the Gateway's default routing falls back to Bedrock/Vertex when our key rate-limits, and those fallbacks bill the Gateway differently.

Configuration: `AI_GATEWAY_API_KEY` is set via Doppler. There is no fallback path that bypasses the Gateway — if the env var is missing, AI calls fail loudly.

## MCP server — Sally's tools

Sally's MCP server (`apps/backend/src/domains/ai/mcp-server/`) exposes 20+ tools that agents and external MCP clients can call. Tools are typed and tenant-scoped — every tool invocation runs inside the active tenant's context and respects RLS.

Tool categories (from the source layout — read the folder for the canonical list):

- Fleet operations (list drivers, dispatch a load, find a vehicle…)
- Financials (look up an invoice, mark paid, fetch settlement…)
- Compliance (run a Shield check, fetch HOS status…)
- Documents (find a rate confirmation, parse a PDF…)
- Knowledge base (RAG queries over uploaded docs…)

The full inventory lives in the source; this doc deliberately doesn't enumerate because it changes.

## Knowledge base / RAG

`apps/backend/src/domains/ai/knowledge-base/` holds the document-ingestion pipeline (chunking, embedding generation, pgvector writes) and the retrieval interface used by agents. Embeddings live in pgvector tables in the same Postgres database as the rest of the schema.

## Sally's Desk runtime

Episodes (one instance of a responsibility being executed) and steps (one tool/LLM call inside an episode) run on **Inngest**. The Desk domain (`apps/backend/src/domains/desk/`) defines responsibilities, schedules them via `DESK_SCHEDULER`/`DESK_TRIGGERS` BullMQ queues, and dispatches episode runs through Inngest functions.

Locally, the Inngest dev server is in `docker-compose.yml` (default profile) and starts on `:8288`. It points at the backend on `host.docker.internal:${BACKEND_PORT:-8001}/api/v1/inngest`.

See [Sally's Desk](sally-desk.md) for the vocabulary, the runtime shape, and the autonomy model.

## Observability of AI calls

Every Mastra agent invocation is logged to `AgentInvocationLog` (Prisma model — see [Data Model](data-model.md)). Direct AI SDK calls log structured events through the same logging pipeline. Traces propagate through OpenTelemetry — see [Observability](observability.md).

## Pinned models

Model versions and aliases are pinned in `ai-provider.ts`. **Do not change them ad-hoc.** Model upgrades are deliberate — a new model means we re-evaluate the prompts and benchmark the outputs (the `tests/evals/` scaffold is meant for this; it isn't wired to CI yet).
