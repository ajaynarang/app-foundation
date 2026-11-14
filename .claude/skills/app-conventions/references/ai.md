---
owner: foundation
sources:
  - apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts#StructuredOutputService
  - apps/backend/src/domains/ai/infrastructure/providers/embedding.service.ts#EmbeddingService
  - apps/backend/src/domains/ai/assistant/mastra/mastra.provider.ts#perRequestModel
  - apps/backend/src/domains/ai/agents/base.agent.ts#AbstractBaseAgent
  - apps/backend/src/domains/ai/moderation/moderation.service.ts#ModerationService
  - apps/backend/src/domains/ai/knowledge-base/kb-audience.ts#kbAudiencesFor
  - apps/backend/src/domains/ai/knowledge-base/knowledge-base.service.ts#hybridSearch
  - apps/backend/src/domains/ai/knowledge-base/content/chunker.ts#CHUNKER_VERSION
  - apps/backend/src/domains/ai/knowledge-base/eval
  - apps/backend/content/kb-eval/golden.json
  - apps/backend/src/domains/prompting/prompting.service.ts#PromptingService
  - apps/backend/src/domains/prompting/prompting.types.ts#PROMPT_NAMES
  - apps/backend/src/domains/prompting/registrars/service-fallback.registrar.ts#ServiceFallbackRegistrar
  - apps/backend/src/domains/feedback/feedback.service.ts#inferCategory
  - apps/backend/src/config/configuration.ts
guards:
  - ai-call-paths.spec.ts
  - model-calls-name-a-ceiling.spec.ts
  - mastra.provider.spec.ts
  - embedding.service.spec.ts
  - structured-output.service.spec.ts
  - moderation-pipeline.integration.spec.ts
  - guardrails-real-load.spec.ts
  - kb-audience.spec.ts
  - knowledge-base-search.integration.spec.ts
  - ingestion.service.spec.ts
  - kb-eval.spec.ts
  - configuration.spec.ts
  - prompting.service.spec.ts
  - service-fallback.registrar.spec.ts
  - pii-redactor.spec.ts
examples:
  - MY_EXTRACTOR
  - MY_EXTRACTOR_FALLBACK
---

# AI: the sanctioned call paths, prompts, moderation, the knowledge base, evals

Every model call gets its model from the route resolver ([`ai-routing.md`](ai-routing.md)) and names an alias,
never a model id. Tools and the tool pipeline are in [`ai-tools.md`](ai-tools.md).

## Rules

### Call paths

There are three sanctioned ways to call a model. Pick by the shape of the work.

| Work                               | Path                                                                               | Ledger row        |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| Chat and agents (streaming, tools) | A Mastra agent through `AbstractBaseAgent` (`apps/backend/src/domains/ai/agents/`) | yes               |
| A structured answer (JSON by zod)  | `StructuredOutputService.extract`                                                  | yes               |
| An embedding                       | `EmbeddingService.embedText` / `embedBatch` / `embedForPlatform`                   | yes, bar platform |

- A Mastra agent owns no model. It is built with `model: perRequestModel`, and every call passes the tenant's
  resolved model in a `RequestContext` under `REQUEST_MODEL_KEY`. A call with none fails loud (a 500); it never falls
  back to a default provider. [guard: ai-call-paths.spec.ts, mastra.provider.spec.ts]
- `extract` requires `aiContext` (the tenant to route by and to bill) and `maxOutputTokens`. It resolves the route,
  checks the budget when asked (`enforceBudget`, platform-paid only), and writes one ledger row per attempt,
  failures included. On a fallback retry pass the first attempt's `aiInvocationId` as
  `aiContext.parentInvocationId`. `aiContext.surface` is an `AiSurface` value (a Prisma enum: a new kind of work is a
  migration); `linkRefType` comes from `AI_LINK_REF_TYPES`. [guard: structured-output.service.spec.ts]
- `extract` redacts listed personal-data fields (by field name) in the messages (`redactMessages`); free text is not
  redacted. [guard: pii-redactor.spec.ts]
- A raw AI SDK call (`generateText`, `streamText`, `embed`, ...) is not a sanctioned path: it writes no ledger row.
  The three that exist (the skill classifier, the feedback categorizer, the key probe) are listed with a reason in
  `apps/backend/src/architecture/ai-call-paths.spec.ts`; a new one is a deliberate edit there, and a new feature uses
  `extract`. [guard: ai-call-paths.spec.ts]
- Every model call names an output ceiling from `OUTPUT_CEILINGS` (`maxOutputTokens`, or
  `modelSettings.maxOutputTokens` on an agent call). [guard: model-calls-name-a-ceiling.spec.ts]
- A resumed chat turn (`resumeStream` after a confirmation card) writes no ledger row and checks no budget today.
  [review-only: a known gap; no spec counts ledger rows per path]

### Moderation

- User text in chat is moderated before the model sees it: `ModerationService.moderate` with `'input'` runs content
  moderation first, then the guards (prompt injection, secrets, system-prompt leakage) in parallel; a block stops the
  turn, personal data is flagged and logged, never blocked. The answer is moderated on the way out (`'output'`), which
  redacts personal data. [guard: moderation-pipeline.integration.spec.ts]
- The guardrails package must really load in the production module format; a failed load fails every guard open.
  [guard: guardrails-real-load.spec.ts]
- Moderation fails open on its own infrastructure error (the message goes through and a warning is logged), by
  design: an outage of the moderation vendor does not stop chat. [review-only: a stated trade-off]

### Embeddings and the knowledge base

- Every embedding names its tenant and its intent: `embedText(text, aiContext, intent)` and
  `embedBatch(texts, aiContext, intent)`, with `'document'` for stored text and `'query'` for a search. Every vector
  is checked at 1536 dimensions (`EMBEDDING_CATALOG`), because two tables carry `vector(1536)`.
  `embedForPlatform(texts, intent)` is for global content only and writes no ledger row.
  [guard: embedding.service.spec.ts]
- The server picks the audience: `search-kb` and `get-product-info` take no audience argument; the audiences come from
  `kbAudiencesFor(role)` (`all`, plus the role's own from `ROLE_AUDIENCE`, empty in the starter), and
  `KnowledgeBaseService` refuses an empty set. The loader refuses a file tagged for an audience no role reads.
  [guard: kb-audience.spec.ts]
- Search never fails because of routing: `hybridSearch` fuses a vector list and a full-text list by reciprocal rank,
  and answers from full-text alone when the query cannot be embedded. [guard: knowledge-base-search.integration.spec.ts]
- The ingester (`pnpm --filter @app/backend seed:knowledge`, `--force` re-embeds all) syncs by content hash and
  touches only the rows whose `sourcePath` it wrote. A change to what the chunker emits bumps `CHUNKER_VERSION`,
  which changes every hash and so re-embeds the corpus. [guard: ingestion.service.spec.ts]

### Prompts

- A prompt has a name in `PROMPT_NAMES` (`apps/backend/src/domains/prompting/prompting.types.ts`) and a code fallback
  in `apps/backend/src/domains/prompting/prompts/fallbacks/`, bound to its name by a registrar
  (`ServiceFallbackRegistrar` for service prompts, `ChatPromptRegistrar` for chat). `PromptingService.getPrompt(name)`
  reads Langfuse first and the fallback when Langfuse is off or the prompt is not published; every service prompt
  name has a registered fallback. [guard: prompting.service.spec.ts, service-fallback.registrar.spec.ts]
- The prompt text lives in its fallback file, never inside the consumer service. [review-only: needs reading]

### Evals

- Ship one eval that runs, not a framework. `pnpm --filter @app/backend kb:eval` is the worked example: pure scoring
  (recall at k, mean reciprocal rank) over a golden set (`apps/backend/content/kb-eval/golden.json`) asked through the
  production search and the same audience rule. [guard: kb-eval.spec.ts]
- Gold labels come from a person reading the source, never from the tool under test. Each names a file, so a rename
  fails the golden set's check. Matching is mechanical (a file in the top k), never a model judging a model.
  [guard: kb-audience.spec.ts]
- A report is dated and committed beside the change it measured (`kb:eval --report <folder>`); it records the mode it
  ran in (`hybrid`, `full-text` or `mixed`), counted from the run. [review-only: committing it needs reading]
- A measurement switch (`AI_PROMPT_CACHE_OVERRIDE`, `AI_USAGE_CAPTURE_DIR`) is ignored on every deployed task: the
  config factory resolves it to unset when `isProductionEnv()` holds. [guard: configuration.spec.ts]
- An eval that spends money (`kb:eval` embeds its queries) is run by a person, never by CI or a hook; its pure scoring
  still runs under `pnpm test`. [review-only: no CI runs it]

## Recipe: add a prompt

Taken from the feedback categorizer: a name, a fallback, the registrar line, and the call. Copy the shape, not the raw
call: a new feature calls `extract`, which writes the ledger row.

```typescript
// 1. apps/backend/src/domains/prompting/prompting.types.ts
export const PROMPT_NAMES = {
  // ...
  MY_EXTRACTOR: 'my-extractor',
} as const;

// 2. apps/backend/src/domains/prompting/prompts/fallbacks/my-extractor.fallback.ts, exported from its index.ts
export const MY_EXTRACTOR_FALLBACK = `You read a support message and return its product area and urgency.`;

// 3. apps/backend/src/domains/prompting/registrars/service-fallback.registrar.ts
const entries: Array<[string, string]> = [
  [PROMPT_NAMES.FEEDBACK_CATEGORIZER, CATEGORIZER_FALLBACK],
  [PROMPT_NAMES.MY_EXTRACTOR, MY_EXTRACTOR_FALLBACK],
];
```

The call, in the service that owns the work. It is written for this recipe, not copied from a caller; its options
are `ExtractOptions` in `apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts`:

```typescript
const systemPrompt = await this.prompting.getPrompt(PROMPT_NAMES.MY_EXTRACTOR);
const { object } = await this.structuredOutput.extract<Triage>({
  messages: [{ role: 'user', content: ticket.description }],
  schema: TriageSchema,
  systemPrompt,
  modelAlias: 'fast',
  timeoutMs: 30_000,
  maxOutputTokens: OUTPUT_CEILINGS.VERDICT,
  // the surface this work is billed under; a new kind of work adds its AiSurface value and AI_LINK_REF_TYPES entry
  aiContext: { tenantId, userId, surface: AiSurface.CHAT, linkRefType: AI_LINK_REF_TYPES.CONVERSATION_MESSAGE },
  enforceBudget: true, // a user-facing, billable surface
});
```

Then publish the same name in Langfuse when you want to change the text without a deploy. A prompt that needs a test
gets one in `apps/backend/src/domains/prompting/__tests__/`.

## Recipe: run the evals

```bash
pnpm --filter @app/backend test -- kb-eval                     # the pure scoring, free, part of pnpm test
pnpm --filter @app/backend kb:eval                             # the real run: embeds each question (costs money)
pnpm --filter @app/backend kb:eval --report docs/evals         # writes kb-eval-<date>.json to commit with the change
```

A new golden question names its `caller` role and the file it expects; `kb-audience.spec.ts` fails when that file is
renamed or the caller could not read it.

## Flag in review

- A Mastra agent given a model of its own, or an agent call with no `RequestContext` model.
- A model call with no `aiContext`, so it is neither routed by tenant nor billed; a new raw SDK call.
- User text reaching a model without input moderation.
- An audience argument on a knowledge-base tool.
- A prompt string written inside a service instead of a fallback file.
- An eval that scores with a model, or labels taken from the tool's own output.
