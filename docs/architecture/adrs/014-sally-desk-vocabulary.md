---
title: "ADR-014: Sally's Desk Vocabulary — responsibility / episode / step"
description: Runtime nouns for Sally's Desk are responsibility, episode, step.
---

# ADR-014: Sally's Desk Vocabulary

**Date:** 2026-05-20
**Status:** Proposed — drafted from schema; awaiting acceptance.

## Context

Sally's Desk — the agent runtime where Sally does proactive work — talks about agents, the duties they hold, and the work they do. Product, engineering, and ops all reference these concepts daily. A shared vocabulary keeps the mental model coherent across teams and across the codebase.

## Decision

**The runtime vocabulary is:**

- **Responsibility** — a standing duty an agent holds (e.g. "follow up on overdue invoices," "check HOS before dispatch"). Persisted as `DeskResponsibility` rows.
- **Episode** — one instance of acting on a responsibility (e.g. "follow up on AR for tenant T at 2026-05-20T15:00"). Persisted as `DeskEpisode` rows with status and outcome.
- **Step** — one tool call or LLM call inside an episode. Persisted as `DeskEpisodeStep` rows so every episode is auditable end-to-end.

Adjacent nouns (verified in schema):

- **Agent** (`DeskAgent`) — an identity that holds responsibilities. Has a `supervisorUserId`.
- **Approval** (`DeskApproval`) — a step or episode that's gated for human review.
- **Suppression** (`DeskEntitySuppression`) — explicit "don't pester me about this load / driver / customer right now."
- **Memory** (`DeskMemory`) — durable per-tenant or per-agent context across episodes.

The route folder `apps/web/src/app/sally-nerve/` is the current surface and is being renamed to `sally-desk/`. The rename is in flight; both names refer to the same product surface during the transition.

## Consequences

### Positive

- One vocabulary across product, engineering, and ops conversations.
- Schema, controllers, services, and docs use the same words.
- "Step" matches industry-standard durable-workflow vocabulary (Inngest, Temporal) — the runtime is Inngest, so the term aligns.

### Trade-offs

- The `sally-nerve` folder rename hasn't happened yet — URLs still show the old name until it does. The [Architecture → Sally's Desk](../sally-desk.md) page calls this out.

### Neutral

- The Desk runtime executes on Inngest (see [Architecture → AI Stack](../ai-stack.md) and [Architecture → Sally's Desk](../sally-desk.md)). This ADR is about vocabulary; the runtime choice is implicit and stable.

## Evidence

- Prisma models — `DeskResponsibility`, `DeskEpisode`, `DeskEpisodeStep`, `DeskAgent`, `DeskApproval`, `DeskEntitySuppression`, `DeskMemory` (verified via `grep -E "^model " apps/backend/prisma/schema.prisma`).
- Controllers / services — `DeskResponsibilityController`, `DeskResponsibilityService`, `DeskEpisodeController`, `DeskEpisodeService`, `DeskStepWriter` (verified via `apps/backend/src/domains/desk/core/`).
- Documented in [Architecture → Sally's Desk](../sally-desk.md).
