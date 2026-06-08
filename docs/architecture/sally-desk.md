---
title: Sally's Desk
description: Vocabulary (responsibility / episode / step), the agent-as-employee model, the runtime (Inngest), the phased autonomy story.
---

# Sally's Desk

Sally's Desk is the agent runtime — the part of the system where Sally does work on her own, not because a user asked her to right now. Today, one agent is live with one responsibility. The plan is to grow it into a full digital workforce — more agents, more responsibilities — until Desk is the primary way fleet work gets done.

## Vocabulary

The runtime nouns are **responsibility**, **episode**, and **step**. Use them. They map directly to Prisma models and controllers.

| Noun | What it is | Prisma model | Controller / Service |
|---|---|---|---|
| **Responsibility** | A standing duty Sally has — e.g. "follow up on overdue invoices," "check HOS status before dispatch." Persisted per tenant, owned by an agent (one agent can hold many responsibilities). | `DeskResponsibility` | `DeskResponsibilityController`, `DeskResponsibilityService` |
| **Episode** | One instance of acting on a responsibility — e.g. "follow up on AR for tenant T at 2026-05-20T15:00." Persisted with status, outcome, supervisor review. | `DeskEpisode` | `DeskEpisodeController`, `DeskEpisodeService` |
| **Step** | One unit of work inside an episode — usually one LLM call or one tool invocation. Persisted so the episode is auditable end-to-end. | `DeskEpisodeStep` | `DeskStepWriter` |

Adjacent concepts:

- **Agent** (`DeskAgent`) — an identity that holds responsibilities. Configured per tenant. Has a `supervisorUserId` who reviews episodes that require human approval.
- **Approval** (`DeskApproval`) — a step or episode outcome that's been gated for human review.
- **Suppression** (`DeskEntitySuppression`) — explicit "don't pester me about this load / driver / customer right now."
- **Memory** (`DeskMemory`) — durable per-tenant or per-agent context that survives episodes.

## The model: agents as employees

The mental model is that Sally has a team of agents, each a competent employee with a job description (their responsibilities). A human supervisor reviews their work. Over time, the supervisor approves more and more episodes without intervention — the autonomy ramps up.

This isn't a metaphor — it's how the schema is shaped:

- Each `DeskAgent` row is a named team member (`sally-billing`, `sally-dispatch`, `sally-compliance`, …).
- Each has a `supervisorUserId` (a real human in the tenant).
- Episodes flow into the supervisor's review queue when policy says they need approval.

## Phased autonomy

Sally's Desk supports a gradient from "always asks" to "fully autonomous." The current phases (per the responsibility schema):

- **Watch only** — agent observes, does not act. Shadow mode.
- **Suggest** — agent prepares actions for supervisor approval. Nothing executes without a human click.
- **Act with notification** — agent acts; supervisor sees a "done" item in their queue, can roll back.
- **Act autonomously** — agent acts; supervisor sees nothing unless something goes wrong.

The phase is configured per tenant + responsibility. A tenant onboarded today might leave billing follow-ups at `suggest` for a few months before bumping to `act with notification`. The Desk schema includes the policy fields that gate this; the responsibility code reads them at episode start.

## Runtime

Episodes execute on **Inngest** — a durable workflow engine. Inngest is the only piece of infrastructure that's external to NestJS / Postgres / Redis for the Desk runtime; it gives us durable scheduling, retries, and step-level observability that BullMQ alone doesn't offer for multi-step workflows.

- Local dev: `docker-compose.yml` runs the Inngest dev server on `:8288` (default profile, auto-started). It targets the backend on `host.docker.internal:8001/api/v1/inngest`.
- Standalone (for occasional troubleshooting): `pnpm inngest:dev`. Note: this script's URL (`http://localhost:8000/api/inngest`) is out of date — it targets the pre-Doppler default port. Use the dockerized Inngest instead.
- The backend mounts the Inngest SDK at `/api/v1/inngest`. Functions are registered from `apps/backend/src/domains/desk/core/inngest/`.

## Schema queues that drive Desk

Two BullMQ queues feed the Desk runtime:

- `DESK_SCHEDULER` — fires on schedule (e.g. "check overdue invoices daily at 9am").
- `DESK_TRIGGERS` — fires on event (e.g. "load delivered → check whether to invoice").

Both ultimately enqueue an Inngest function invocation; Inngest handles the actual step orchestration.

## Frontend surface

The dispatcher web app surfaces Desk through the `/sally-nerve` route today. **The route is being renamed to `/sally-desk` as part of the broader rebrand.** Until then, both names refer to the same surface; `sally-nerve` is the working filesystem name, `sally-desk` is the planned URL.

Frontend code lives in `apps/web/src/features/desk/` — components, hooks, and a Zustand store (`store/desk-store.ts`).

## Where to add new responsibilities

1. Register the responsibility under `apps/backend/src/domains/desk/responsibilities/`. It needs a `definition.types.ts`-compatible definition.
2. Implement its step logic — usually a small set of helper functions in `apps/backend/src/domains/desk/shared-steps/`. The `_llm-step.helper.ts` is the common pattern for "one LLM call."
3. Add the Inngest function in `apps/backend/src/domains/desk/core/inngest/`.
4. Add the scheduler/trigger row to the database via `DeskBootstrapService` or the seed.
5. Add UI in `apps/web/src/features/desk/`.

The full pattern is documented in `sally-backend-patterns` skill — read it before adding a new responsibility.

## What Sally's Desk is not

- It's not a chatbot. The conversation surfaces (`/sally-canvas`, `/sally-default`) are separate — those are reactive (user asks, Sally answers). The Desk is proactive (Sally has things she's going to do today).
- It's not a job runner. BullMQ runs jobs; Sally's Desk runs *work*. A job is a queue line; an episode is a coherent unit of attention that may take several steps and may end up in front of a human.
