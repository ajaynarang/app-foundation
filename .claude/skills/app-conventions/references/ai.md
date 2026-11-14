---
owner: foundation
status: interim
pending: F3
sources:
  - apps/backend/src/domains/ai/knowledge-base/kb-audience.ts#kbAudiencesFor
  - apps/backend/src/domains/ai/knowledge-base/eval
  - apps/backend/content/kb-eval/golden.json
  - apps/backend/src/domains/prompting
  - apps/backend/src/domains/ai/moderation
  - apps/backend/src/config/configuration.ts
guards:
  - kb-eval.spec.ts
  - guardrails-real-load.spec.ts
  - prompt-registry.data.spec.ts
  - model-calls-name-a-ceiling.spec.ts
---

# AI: the sanctioned call paths, prompts, moderation, the knowledge base, evals

Moved from the old backend skill; condensed with its recipes in its finish pull request. Every call here gets its model
from the route resolver ([`ai-routing.md`](ai-routing.md)); tools are in [`ai-tools.md`](ai-tools.md).

A structured call, in short (the real calls are in the services that inject `StructuredOutputService`):

```typescript
const { object } = await this.structuredOutput.extract({
  messages,
  schema,
  systemPrompt,
  modelAlias: 'fast',
  timeoutMs: 30_000,
  maxOutputTokens: OUTPUT_CEILINGS.VERDICT,
  aiContext: { tenantId, surface: AiSurface.CHAT }, // the tenant to route by and to bill
});
```

## Rules

### Call paths

- Conversational and agent AI goes through the Mastra agent runtime in `apps/backend/src/domains/ai/`. A Mastra agent
  has no model of its own: pass the resolved one per call (`RequestContext` with `REQUEST_MODEL_KEY`).
  [review-only: needs reading]
- Workflow-shaped work calls the AI SDK through `StructuredOutputService.extract`, which requires `aiContext` and
  `maxOutputTokens`. A raw AI SDK call resolves first (`route.languageModel('standard')`) and documents why it is raw;
  do not add new direct-SDK call sites without a reason. [guard: model-calls-name-a-ceiling.spec.ts]
- Document extraction tries `standard`, retries on `powerful`, and returns
  `{ fallbackUsed, fallbackReason, model, durationMs }`. [review-only: needs reading]
- Every AI call lands a row in the per-tenant ledger (`ai_invocations`) with the route that served it; user-facing chat
  goes through moderation. Never bypass either. [guard: guardrails-real-load.spec.ts]

### Embeddings and the knowledge base

- Every embedding names its tenant and its intent: `EmbeddingService.embedText(text, aiContext, intent)` and
  `embedBatch(texts, aiContext, intent)`, with `'document'` for stored text and `'query'` for a search. Every vector is
  checked at 1536 dimensions. `embedForPlatform(texts, intent)` is for global content only.
  [review-only: needs reading]
- The server picks the audience: `search-kb` and `get-product-info` take no audience argument; the audiences come from
  `kbAudiencesFor(role)` (`all`, plus the role's own from `ROLE_AUDIENCE`, empty in the starter), and
  `KnowledgeBaseService` refuses an empty set. The loader refuses a file tagged for an audience no role reads.
  [guard: kb-audience.spec.ts]
- Search never fails because of routing: `hybridSearch` fuses a vector list and a full-text list by reciprocal rank,
  and answers from full-text alone when the query cannot be embedded. [guard: knowledge-base-search.integration.spec.ts]
- The ingester (`pnpm seed:knowledge`) syncs by content hash and touches only the rows whose `sourcePath` it wrote.
  Changing what the chunker emits bumps `CHUNKER_VERSION`, which re-embeds the corpus. [review-only: needs reading]

### Prompts

- Prompts load through `PromptingService` (`apps/backend/src/domains/prompting/`): Langfuse first, with a
  code-registered fallback. Register prompts through the domain's registrar; names live in `PROMPT_NAMES`.
  [review-only: needs reading]

### Evals

- Ship one eval that runs, not a framework. `pnpm kb:eval` is the worked example: pure scoring (recall at k, mean
  reciprocal rank, unit-tested) over a golden set (`apps/backend/content/kb-eval/golden.json`) asked through the
  production code path and audience rule. [guard: kb-eval.spec.ts]
- Gold labels come from a person reading the source, never from the tool under test, and name a file or record so a
  rename fails the eval's data spec. Matching is mechanical, never a model judging a model. [review-only: needs reading]
- Reports are dated and committed beside the change they measured (`pnpm kb:eval --report <folder>`), with the mode they
  ran in counted from the run. [review-only: needs reading]
- A measurement switch is ignored on every deployed task: it resolves to unset in `config/configuration.ts` when
  `isProductionEnv()` is true. [guard: configuration.spec.ts]
- An eval that spends money is run by a person, never by CI or a hook; its pure scoring still runs under `pnpm test`.
  [review-only: no CI runs it]

## Flag in review

- A Mastra agent constructed with a fixed model.
- A model call with no `aiContext`, so it is neither routed by tenant nor billed.
- An audience argument on a knowledge-base tool.
- An eval that scores with a model, or labels taken from the tool's own output.
