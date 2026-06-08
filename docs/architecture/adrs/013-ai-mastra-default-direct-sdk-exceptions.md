---
title: "ADR-013: AI Invocation — Mastra default with documented exceptions"
description: Mastra agents are the default path for AI calls. Direct Vercel AI SDK use is permitted for a small, explicit set of workflow-shaped exceptions.
---

# ADR-013: AI Invocation — Mastra default with documented exceptions

**Date:** 2026-05-20
**Status:** Proposed — drafted from observed AI code paths; awaiting acceptance.

## Context

SALLY uses both the Vercel AI SDK (`ai` ^6) for raw `generateText` / `streamText` / `generateObject` primitives, and the Mastra agent framework (`@mastra/core` ^1.4) for higher-level agent orchestration. Without a rule, every new AI call faces a choice: write an agent or call the SDK directly?

In practice, the answer should be "agent" for conversational and multi-step work, and "direct SDK" for workflow-shaped one-shot calls (parse this document, classify this string, summarize this feedback). Past notes claimed only two direct-SDK exceptions; a code audit found six. The rule needs to match reality.

## Decision

**Mastra agents are the default path for AI invocation.**

Direct AI SDK calls are permitted only for these documented exceptions — files in the codebase where the work is genuinely workflow-shaped, not agent-shaped:

| File | Reason for direct AI SDK use |
|---|---|
| `apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts` | Document extraction with typed schemas — needs `generateObject` with a Zod schema, no agent loop |
| `apps/backend/src/domains/ai/document-intelligence/ratecon/ratecon-parser.service.ts` | Rate confirmation parsing — uses `StructuredOutputService` |
| `apps/backend/src/domains/ai/document-intelligence/fuel-receipt/fuel-receipt-parser.service.ts` | Fuel receipt parsing — same shape |
| `apps/backend/src/domains/ai/orchestrator/skill-classifier.service.ts` | Lightweight classification — picks which agent should handle an inbound user message; calling an agent to pick an agent is circular |
| `apps/backend/src/domains/desk/shared-steps/_llm-step.helper.ts` | Desk step helper — a step is intentionally one LLM call, not a full agent loop |
| `apps/backend/src/domains/platform/feedback/feedback.service.ts` | Feedback classification — one-shot summarize/categorize |

Plus `apps/backend/src/domains/ai/agents/base.agent.ts`, which IS the Mastra agent base class (not an exception — that's where Mastra is used).

**Provider routing is unconditional.** All AI calls — agent or direct — route through the Vercel AI Gateway, configured in `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts`. There is no fallback path that bypasses the Gateway.

**New code is Mastra unless it matches one of the documented patterns.** When unsure, write the agent first; if it feels over-engineered for what's actually a single LLM call, raise it in review.

## Consequences

### Positive

- One mental model — "default is Mastra" — instead of case-by-case judgment.
- The exception list is enumerated and reviewable.
- Cross-cutting concerns (audit logging via `AgentInvocationLog`, telemetry, prompt versioning) are uniformly applied to agent calls. Direct calls live in known files that the audit can sweep.
- AI Gateway routing gives us one billing surface and one observability surface for everything.

### Trade-offs

- The exception list will grow over time. This ADR should be **amended** when a new exception is justified — not silently expanded.
- "Agent or direct?" still requires judgment for new code. The exception list is a guide, not a substitute for thinking.

### Neutral

- This ADR doesn't constrain which models or providers we use — that's the AI Gateway config (`ai-provider.ts`).
- Prompt versioning lives in the `prompting/` domain (Langfuse-style); orthogonal to this decision.

## Evidence

- `apps/backend/package.json` — `@mastra/core: ^1.4.0`, `ai: ^6.0.86`.
- `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts` — gateway-based provider routing.
- `apps/backend/src/domains/ai/sally-ai/mastra/mastra.provider.ts` — Mastra provider wiring.
- The exception files listed in the table above — confirmed via `grep -rE "generateText|streamText|generateObject" apps/backend/src/domains/`.
- Memory pin: "AI/LLM Pattern Note" (in `MEMORY.md`) — recorded the rule with a smaller exception list; this ADR ratifies the larger actual list.
- Documented in [Architecture → AI Stack](../ai-stack.md).
