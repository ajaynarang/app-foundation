# Upgrade note: the AI platform

For a product that was scaffolded from this starter **before** the AI platform work, and now pulls it.

This file lists every change to AI behaviour, the environment contract and the schema, in the order the changes
were made. Each section says what changed, who notices, and what to do. Pull the work as a whole, with one
exception: the migration that drops the `ai_reader` role (see "Deploy order for `ai_reader`" below).

## 1. Guardrails load for real

**What changed.** The local guardrails (prompt injection, secrets, PII, system-prompt leakage) never loaded. The
backend is compiled to CommonJS, which turned `await import('@presidio-dev/hai-guardrails')` into `require()` of an
ESM-only package. Every boot logged `Failed to initialize guardrails engines` and every check failed open. The
package is now loaded with a native `import()` (`apps/backend/src/shared/utils/esm-import.ts`), and a pnpm patch
(`patches/@presidio-dev__hai-guardrails@1.12.0.patch`) fixes two broken paths inside the package's own bundle (a
hardcoded build-machine `__dirname` for its worker pool, and a worker file name that does not exist).

**Who notices.** Chat users. Messages that look like a prompt injection or carry a secret are now blocked, and PII
is redacted, as the moderation pipeline always intended. Check your assistant's flows for false positives.

**What to do.**

- Keep `@presidio-dev/hai-guardrails` pinned to exactly `1.12.0` in `apps/backend/package.json`. The patch is
  keyed to that version; a different version installs unpatched.
- Keep the `pnpm.patchedDependencies` entry in the root `package.json` and the `patches/` folder.
- If your Dockerfiles differ from the starter's, copy `patches/` into the image before the frozen install
  (`pnpm install --frozen-lockfile`); that install fails without it.
- No environment variable and no schema change.

## 2. The AI RLS wrapper is gone; migration `drop_dead_ai_rls`

**What changed.** Every tool call from chat, MCP or Desk ran inside a transaction that set
`SET LOCAL ROLE ai_reader`. No tool used that transaction's client, so the role's row-level policies applied to
nothing, and each call held a second pooled connection. The wrapper (`apps/backend/src/domains/ai/rls/`) is
deleted. Tools are called directly; tenant isolation is, as before, each tool's own `_tenantId` filter.

Migration `20261112200000_drop_dead_ai_rls` drops the two policies (`tenant_isolation_conversation`,
`tenant_isolation_message`) and disables row-level security on `conversations` and `conversation_messages`, but
only on a table where no other policy is left. It does not drop the `ai_reader` role. Rows are untouched.

**Who notices.** Nobody on the wire. Tool calls use one connection instead of two.

**What to do.**

- If you added your own `ai_reader` grants or policies for your tool tables (the old migration invited it), they
  were never enforced either, because tools query through the table owner's connection. Remove them, or replace
  them with real row-level security that comes with its own tenant-context plumbing.
- If your tools import `AiPrismaService` or `RlsModule`, drop the import and run the query directly.
- Deploy normally. The migration is safe for tasks still on the old code: it only removes restrictions, and the
  role they switch to still exists.

## 3. Claude 5.5 models, one model catalog, output ceilings

**What changed.** The three model aliases now run the Claude 5.5 family: `fast` is `claude-haiku-5-5`, `standard`
is `claude-sonnet-5-5`, `powerful` is `claude-opus-5-5` (on the Vercel AI Gateway: `anthropic/claude-haiku-5.5`
and so on). No 4.x model is kept as a fallback. Every model id now lives in one file,
`apps/backend/src/domains/ai/routing/model-catalog.ts`; `MODEL_ID_BY_ALIAS`, `PROVIDER_BY_ALIAS`,
`EMBEDDING_MODEL_ID` and `EMBEDDING_PROVIDER_LABEL` are gone from `ai-provider.ts`. The embedding model is
unchanged for now (`text-embedding-3-small` through the gateway).

- `@ai-sdk/anthropic` moves to `^3.0.136`. The older version sent a forced JSON tool for structured output, which
  Sonnet 5.5 and Opus 5.5 reject with a 400.
- With `AI_PROVIDER=anthropic`, each alias sends an effort (`fast` low, `standard` and `powerful` medium; thinking
  is always on for these models), and a call the model refuses (finish reason `content-filter`) is retried once on
  the next alias up. The ledger records the model that answered. The gateway mode gets the new ids but no tuning.
- Every model call now sets an output ceiling. `StructuredOutputService.extract` requires `maxOutputTokens`; the
  sizes are in `apps/backend/src/domains/ai/routing/output-ceilings.ts`, and none is below 1,024 because thinking
  counts toward it. The skill classifier's cap rises from 50 to 1,024 and an empty answer is logged; chat steps are
  capped at 8,000 tokens each. `runStructuredLlmStep` (Desk) takes a required `maxOutputTokens`.
- New pricing rows for the three 5.5 models (`anthropic` and `openrouter`) and for Cohere `embed-v4.0`. Old rows
  stay: the ledger prices history by model id. Haiku 5.5 bills more on prompts above 100K tokens; the ledger keeps
  the base rate and logs a warning for such a call.

**Who notices.** Everyone who uses AI: answers come from newer models, at lower prices than the 4.x rows. Anything
of yours that names a model id, reads `MODEL_ID_BY_ALIAS`, or calls `extract` without a ceiling stops building.

**What to do.**

- Replace model ids in your code with an alias. If you need an id (for the ledger), read it from `MODEL_CATALOG`.
  Two architecture specs hold this: `model-id-literals.spec.ts` (no model id outside the catalog) and
  `model-calls-name-a-ceiling.spec.ts` (every `extract`, AI SDK and Mastra agent call names `maxOutputTokens`).
- Give each of your `extract` calls and Desk LLM steps a ceiling from `OUTPUT_CEILINGS`, sized to its answer.
- Run the pricing seed (`pnpm --filter @app/backend seed:model-pricing`) in every environment, or the new models'
  calls are recorded with a null cost. The rows come from Anthropic's price table cached on 2026-11-03; check them
  against the live price page first.
- With an Anthropic key, run `pnpm --filter @app/backend ai:live-check` once: one plain and one structured call per
  alias at the smallest ceiling. It spends a few cents and is skipped when `ANTHROPIC_API_KEY` is unset.
- No environment variable and no schema change.

## 4. The route resolver arrives (nothing uses it yet)

**What changed.** A new module, `apps/backend/src/domains/ai/routing/` (`AiRoutingModule`, `AiRouteResolver`,
`route-registry.ts`), is the future single way to get a model: `resolve(tenantId, 'language' | 'embedding')` picks a
route for the tenant and fails closed with a typed error (`AiNotConfigured` 503, `ZeroRetentionUnavailable` 400, and
`AiModelNotOnRoute` 503 for an alias the catalog left without an id on that route). It knows two platform routes:
`platform-openrouter` for language (the catalog's `openrouterId` slugs) and `platform-cohere` for embeddings (Cohere
Embed v4 at 1536 dimensions). No caller is moved onto it yet; the app still runs on `ai-provider.ts`. Two packages
are added: `@openrouter/ai-sdk-provider` and `@ai-sdk/cohere`.

- Three optional keys join the config schema: `OPENROUTER_API_KEY` (`openRouterApiKey`), `COHERE_API_KEY`
  (`cohereApiKey`) and `OPENAI_API_KEY` (`openaiApiKey`). The moderation client now reads `OPENAI_API_KEY` through the
  schema instead of `process.env`; its behaviour is unchanged (unset means external moderation is off).
- `pnpm --filter @app/backend ai:live-check` gains two legs: with `OPENROUTER_API_KEY`, one plain and one
  structured call per alias through OpenRouter (effort sent as `reasoning.effort`, smallest ceiling); with
  `COHERE_API_KEY`, one embedding that must come back at 1536 dimensions. Each leg is skipped without its key.

**Who notices.** Nobody yet. Setting the two new keys changes nothing until the callers move onto the resolver.

**What to do.**

- Create an OpenRouter account and a Cohere account now, and put `OPENROUTER_API_KEY` and `COHERE_API_KEY` in every
  environment (Doppler) ahead of the change that moves chat and embeddings onto the resolver. Run the live check
  once with both keys and keep its output.
- If you read `process.env.OPENAI_API_KEY` yourself, read `openaiApiKey` through `ConfigService` instead.
- No schema change.

## 5. Language calls move onto the resolver; zero retention is enforced for them; the ledger records the route

**What changed.** Every language call now gets its model from `AiRouteResolver.resolve(tenantId, 'language')`:
structured output (`StructuredOutputService`, so Desk steps and Desk memory extraction too), the skill classifier,
feedback categorization, and chat. Chat agents own no model any more: `mastra.provider.ts` registers each agent with
`perRequestModel`, and every call site (a chat turn, a delegated `execute`, a resume) passes the resolved model in
the Mastra `RequestContext` under `REQUEST_MODEL_KEY` (`apps/backend/src/domains/ai/routing/request-model-key.ts`).
An agent invoked without one throws a 500; it never falls back to a default provider. Embeddings are unchanged in
this step (they still use `ai-provider.ts` and `text-embedding-3-small`; section 6 moves them).

- The default language route is `platform-openrouter`. With `OPENROUTER_API_KEY` unset, chat, the classifier,
  feedback categorization, Desk LLM steps and memory extraction answer `AiNotConfigured` (503). `AI_PROVIDER`,
  `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` no longer reach any language call (they are removed from the config in
  the next step).
- The model tuning moved into the resolver and is applied per route: the alias's effort goes in the route family's
  own shape (`reasoning.effort` on OpenRouter), and a refused generate call is retried once on the next alias up on
  the same route (`routing/model-tuning.middleware.ts`).
- Zero retention is enforced in the resolver for every language call, not only structured output. Until a
  zero-retention route exists (Bedrock, later in this project), a workspace with `aiZeroRetention` is refused with
  `ZeroRetentionUnavailable` (400) on chat, Desk steps, memory extraction and feedback categorization, and the
  classifier sends nothing and routes to the default agent. External input moderation (OpenAI) is skipped for such a
  workspace; the local guardrails still run. `AiTelemetryService.assertZeroRetention` is gone; the resolver raises
  `AI_ZERO_RETENTION_UNAVAILABLE` (with `{ need }` in the payload, where the old check sent `{ tier }`).
- `StructuredOutputService.extract` now requires `aiContext` (the tenant to route by) and no longer accepts a
  pre-built `model`.
- Chat answers a routing refusal before the first byte as the error envelope with its own status and code (503 or
  400), not a generic 500.
- The ledger (`ai_invocations`) gains `route_id` (`VARCHAR(64)`) and `credential_type` (`VARCHAR(40)`), both
  nullable, in migration `20261112210000_ai_invocation_route`. Each language row records the route that served it
  (`platform-openrouter`, `PLATFORM_OPENROUTER`), its provider label (`openrouter`) and the model id on that route
  (`anthropic/claude-sonnet-5.5`), which is what the `openrouter` pricing rows are keyed by. Rows written before keep
  null in both, which reads as platform-paid.

**Who notices.** Everyone who uses AI: language calls now run through OpenRouter. A deployment without
`OPENROUTER_API_KEY` loses chat and every other language feature until the key is set. A zero-retention workspace
loses chat and the other language features until a zero-retention route is enabled.

**What to do.**

- Before deploying, set `OPENROUTER_API_KEY` in every environment (see section 4) and run the pricing seed so the
  `openrouter` rows exist.
- Tell any workspace with `aiZeroRetention` that AI stops for it until a zero-retention route is enabled.
- If your code calls `extract` without `aiContext` or with `model`, pass the tenant's context and drop `model`.
- If you invoke a Mastra agent yourself, resolve the route and pass
  `new RequestContext([[REQUEST_MODEL_KEY, route.languageModel(alias)]])` as `requestContext`.
- If you listen for `AI_ZERO_RETENTION_UNAVAILABLE`, read `need` instead of `tier`.
- Deploy normally: the migration is additive and nullable, with no backfill. Rollback: revert the change; the two
  columns can stay.

## 6. Embeddings move onto the resolver; old vectors are cleared; `ai-provider.ts` and its variables are gone

**What changed.** Every embedding now comes from the route resolver, so the old provider file is deleted. This is
the change with a data step.

- `EmbeddingService.embedText(text, aiContext, intent)` and `embedBatch(texts, aiContext, intent)` take their model
  from `resolve(tenantId, 'embedding')`. `aiContext` (the tenant to route by and to bill) and `intent` (`'document'`
  for stored text, `'query'` for search text) are required. The model is Cohere Embed v4 at 1536 dimensions
  (`platform-cohere`, `COHERE_API_KEY`), sent with Cohere's input type; every vector is checked at 1536 before it is
  returned. Each call lands a ledger row with its route (`platform-cohere`, `PLATFORM_COHERE`, provider `cohere`,
  model `embed-v4.0`); a failed provider call lands an `ERROR` row. `embedForPlatform(texts)` embeds global content
  (the knowledge base) on the platform route with no tenant ledger row. `text-embedding-3-small` is retired.
- Zero retention now covers embeddings: a workspace with `aiZeroRetention` is refused (`ZeroRetentionUnavailable`)
  before its text leaves, until a zero-retention embedding route exists.
- Migration `20261112220000_clear_embedding_vectors` sets `knowledge_documents.embedding` and
  `desk_memories.content_embedding` to NULL. Rows and text are kept. OpenAI and Cohere vectors live in different
  spaces, so an old vector left searchable would match new queries at random.
- Knowledge-base search never fails because of routing. When the query cannot be embedded (no `COHERE_API_KEY`, a
  zero-retention workspace, a provider error) or no matching chunk has a vector yet, it answers from full-text. The
  `search-kb` tool embeds the query on the calling workspace's own route. Desk memory recall already scored without
  the semantic term when it had no query vector; it now embeds the query on the workspace's route too.
- `pnpm seed:knowledge` boots again: its module provided `EmbeddingService` without the services it injects. It now
  loads the app's config schema and the resolver (`IngestionCliModule`). With no `COHERE_API_KEY` it stores the
  chunks without vectors and says so; search uses full-text until a run with the key. The starter's `welcome.md`
  gained the `documentType` the loader requires.
- New command, for a product that kept Desk: `pnpm --filter @app/backend ai:reembed-desk-memory [--tenant <id>]`.
  It re-embeds Desk memories with no vector, tenant by tenant, on each tenant's own route (so the right payer and
  retention apply, with a ledger row per batch). A tenant its route refuses is skipped and named; it exits 1 only
  when a tenant failed for another reason. Safe to re-run. A product scaffolded without Desk does not have it.
- Removed: `apps/backend/src/domains/ai/infrastructure/providers/ai-provider.ts` (`ai`, `aiDirect`, `aiEmbedding`,
  `isAiConfigured`, `getRequiredAiEnvVar`, `ZDR_ELIGIBLE_TIERS`), the catalog's `LEGACY_EMBEDDING`, and the config
  key `anthropicApiKey`. `AI_PROVIDER`, `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` are no longer read; each one
  still set logs one warning at boot. `ANTHROPIC_API_KEY` stays in `.env.example` as a developer's test key (the
  live check reads it); it is not a platform route.
- Provider packages (`@ai-sdk/*`, `@openrouter/*`, `openai`) and `createGateway` may be imported only under
  `domains/ai/routing/` and `domains/ai/moderation/` (`ai-provider-clients.spec.ts`).
- New ADR: "AI provider routing is per tenant; retention is enforced in the resolver".

**Who notices.** Anyone using knowledge-base search or Desk memory: until the re-embed runs, search answers from
full-text and memory recall has no semantic matches; nothing errors. A deployment without `COHERE_API_KEY` keeps
full-text search only. A zero-retention workspace loses vector search and memory embeddings.

**What to do (rollout).**

1. Set `OPENROUTER_API_KEY` and `COHERE_API_KEY` in every environment before deploying (see section 4).
2. Deploy. The migration clears the old vectors.
3. Run `pnpm --filter @app/backend seed:knowledge` against each environment. If you kept Desk, then run
   `pnpm --filter @app/backend ai:reembed-desk-memory`. Both need `DATABASE_URL`, `REDIS_URL` and the keys above.
4. Remove `AI_PROVIDER`, `AI_GATEWAY_API_KEY` and, unless a developer uses it as a test key, `ANTHROPIC_API_KEY` from
   Doppler and your task definitions. Until then they are ignored and each logs a boot warning.
5. Tell any workspace with `aiZeroRetention` that AI, including vector search and memory embeddings, stops for it
   until a zero-retention route is enabled.
6. In your own code: pass `aiContext` and an intent to every `embedText` / `embedBatch` call; use `embedForPlatform`
   only for content with no tenant; replace any import of `ai-provider` with the resolver
   (`AiRouteResolver.resolve(tenantId, need)`); read nothing from `anthropicApiKey`.

**Rollback.** Revert the change and restore the old variables. The vectors were cleared, so re-run
`pnpm seed:knowledge` on the old code; Desk memory vectors come back only as new memories are written. The ledger
columns from section 5 are nullable and stay.

## Deploy order for `ai_reader`

A later change in this project adds the migration `drop_ai_reader_role`, which revokes the role's grants and drops
it. Old tasks run `SET LOCAL ROLE ai_reader` on every tool call, so that migration must not run while any task on
the old code is still serving. Deploy every change before it (at least section 2 above) in every environment
first, and only then pull the change that drops the role. Pulled in one deploy, both migrations would run while old
tasks still switch to the role.
