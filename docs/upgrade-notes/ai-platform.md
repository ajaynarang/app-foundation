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

## 7. Cost: cache writes, who paid, plan budgets, prompt caching, credit refusals

**What changed.** The ledger prices what the provider bills, and the AI budget caps only the platform's money.

- Migration `20261112230000_ai_cost_cache_write_and_payer`:
  - `ai_invocations.cache_write_tokens` and `model_pricing.cache_write_input_per_mtok_usd`, both nullable. A pricing
    row with no write rate prices a cache write at its input rate.
  - The three `vw_ai_cost_*` views are dropped and created again with `platform_cost_usd` beside `total_cost_usd`.
    If you query them with `SELECT *` by position, check your code: the column order changed.
  - Budget rows nobody chose become the plan seeder's: `notes` is set to `plan:DEFAULT` where it is null and all four
    caps are still the schema defaults (5 / 20 / 50 / 200). A row with any other cap was edited by an admin and is
    left alone. An admin row left at exactly the defaults with no note is now seeder-owned: a plan change rewrites
    it. Give it a note in the admin AI Spend editor if it must stay put.
- Every AI call's usage is read through `usageFromAiSdk` (`telemetry/usage-from-ai-sdk.ts`), so cache reads and
  cache writes are recorded on every route and summed over multi-step chat turns. Cost = plain input + cache reads at
  the read rate + cache writes at the write rate + output. The pricing seed adds the write rate (1.25x input) to every
  Claude row and fills it in once on rows seeded before the column existed (`pnpm --filter @app/backend
seed:model-pricing`, or the full seed).
- Who paid: the platform when the row's `credentialType` is null or starts with `PLATFORM_`, the workspace otherwise
  (`PLATFORM_PAID_SQL` / `payerOf` in `telemetry/platform-paid.ts`). The budget's spend sum counts platform-paid rows
  only, and chat and structured output check the cap only when the resolved route's payer is `PLATFORM`. Today every
  route is the platform's, so nothing is capped differently yet; this is in place before workspaces can bring their
  own keys.
- Admin AI Spend shows the route and the payer on each call, and the platform-paid part of every total. The
  cost-versus-budget panel sets the caps against platform-paid cost. Wire changes (additive):
  `windowPlatformCostUsd` on the tenant rows, the summary and the surface rows; `cacheWriteTokens`, `routeId`,
  `credentialType` and `payer` on each invocation; `platformUsd` and `tenantUsd` on the cost-versus-quota body.
- Plan budgets: `PLAN_AI_BUDGETS` (`domains/ai/routing/provisioning/plan-ai-budgets.ts`) sets each plan's caps.
  **The dollar values are placeholders; set your own.** The seeder writes them when a workspace is approved, when
  its plan changes (`PlansService.assignPlan` now calls the new optional `planAssigned` tenant-provision hook), after
  a personal-mode signup, and once at boot in single mode for `IMPLICIT_TENANT_ID`. It never touches a budget whose
  note does not start with `plan:`; an admin edit keeps it that way. Both lazy creators of a budget row now stamp
  `plan:DEFAULT`.
- Personal-mode signup now calls `tenantApproved` after the workspace is created. Every tenant-provision hook runs
  for a personal workspace, so with Desk kept, a personal workspace is now Desk-bootstrapped too, which it was not
  before. A hook failure is logged and never fails the signup.
- New platform notification type `AI_BUDGET_REACHED`: when a workspace's platform-paid spend hits its hard cap,
  owners and admins are told, at most once a day per workspace (`AiBudgetNudgeListener`).
- Prompt caching by route: each route declares `promptCache` and the resolver adds the cache breakpoint (the last
  system message, and the last message once the prompt has an assistant turn) to the provider request.
  `platform-openrouter` uses OpenRouter's `cacheControl`. Expect a cache write on the first turn of a conversation and
  cheaper reads after it.
- A provider credit refusal (a 402, "credit balance is too low", "insufficient_quota", OpenRouter's "requires more
  credits" or "Key limit exceeded") becomes `AiProviderCreditRefused`, a 402 budget error, in structured output, the
  chat stream and embeddings, instead of a 5xx or an empty answer. On a platform-paid route it is logged at error
  level: top up the platform's provider balance.
- New local-only variables: `AI_PROMPT_CACHE_OVERRIDE=none` (turn caching off to measure the uncached baseline) and
  `AI_USAGE_CAPTURE_DIR` (write usage shapes for fixtures). Both are ignored on every deployed task.

**Who notices.** Super-admins (new columns in AI Spend). Workspace owners and admins (a new notification when the
cap is reached). Workspaces on a plan whose preset differs from the defaults (their caps move at the next approval,
plan change or, in single mode, the next boot). Personal-mode products with Desk (new workspaces get Desk agents).

**What to do.**

1. Set your own dollar values in `PLAN_AI_BUDGETS` before you rely on the caps.
2. Deploy. The migration is additive; the backfill touches only default rows with no note.
3. Run the pricing seed so existing pricing rows get their cache-write rate.
4. If you implement `TenantProvisionHooks` yourself, `planAssigned` is optional; add it if you react to plan changes.
   `featureHookProviders(features, alwaysOn)` now takes the app's always-on hooks first.
5. If you sum `ai_invocations.cost_usd` for a cap or a bill, decide whether it should be platform-paid only and use
   `PLATFORM_PAID_SQL`.

**Rollback.** Revert the change. The new columns are nullable and can stay, and the new views keep every old column,
so the old code reads them by name unchanged. Budget notes stamped `plan:DEFAULT` are harmless to the old code, which
ignores notes.

## 8. Voice usage in the ledger

**What changed.** A voice session's speech half (Deepgram speech-to-text, Cartesia text-to-speech, the LiveKit agent
session) cost money and wrote no ledger row. It now writes one `VOICE` row per meter, priced per unit. The language
turns of a voice session were already recorded as `CHAT` and still are.

- Migration `20261112233000_ai_voice_usage`: `AiSurface` gains `VOICE`; new enum `AiUsageUnit` (`TOKEN`,
  `AUDIO_SECOND`, `CHARACTER`, `SESSION_SECOND`); `ai_invocations` gains `usage_unit` (default `TOKEN`) and
  `usage_quantity` (nullable); `model_pricing` gains `unit_price_usd` (nullable). Existing rows become `TOKEN` rows
  with a null quantity.
- A voice row has 0 tokens and `usageQuantity` in its unit; its cost is `usageQuantity x unitPriceUsd`. A pricing row
  with no unit price records the usage with a null cost and logs a warning.
- The voice agent (`voice-agent.entry.ts`) reports the session's totals once, when the session closes or the job
  shuts down, to the new internal route `POST /api/v1/voice/internal/usage` (204). It uses the same
  `X-Voice-Agent-Secret` as `internal/respond`, and the conversation must be the body's user's in the body's
  workspace (404 otherwise). The report carries a session id minted by the agent, so a retried report records
  nothing new. A failed report is logged by the agent and never breaks the call.
- Voice rows carry no route and no credential type: the voice vendors run on platform keys, so the rows are
  platform-paid and count toward the workspace's AI cap. A workspace that talks a lot reaches its cap sooner than
  before.
- The pricing seed adds `deepgram` / `nova-3` (per audio second), `cartesia` / `sonic-3` (per character, at the
  Startup plan's credit rate) and `livekit` / `agent-session` (per session second, at the overage rate). Checked
  against each vendor's price page on 2026-11-12. If you pay another plan, or run another model
  (`DEEPGRAM_STT_MODEL`, `CARTESIA_TTS_MODEL`), add your own row; without one, those rows record a null cost.
- Admin AI Spend labels the new surface "Voice (speech)".

**Who notices.** Super-admins (voice rows in AI Spend). Workspaces that use voice (their platform-paid spend now
includes it).

**What to do.**

1. Deploy. The migration is additive.
2. Run the pricing seed (`pnpm --filter @app/backend seed:model-pricing`, or the full seed) so the voice rows exist.
3. Check the three unit prices against the plans you actually pay for.

**Rollback.** Revert the change. The new columns are nullable or defaulted and can stay; old code ignores them. The
`VOICE` enum value cannot be removed without recreating the type; it is harmless to leave.

## 9. Bring-your-own-key: workspace AI keys and the retention policy

**What changed.** A workspace can connect its own Anthropic, OpenRouter or Vercel AI Gateway key and pay for its own
language calls, and an owner can require zero data retention. Both are API only for now; the settings screen comes
in a later change.

- Migration `20261112235000_ai_credentials`: new table `ai_credentials` and enums `AiCredentialType` (`ANTHROPIC_KEY`,
  `BEDROCK_ROLE`, `OPENROUTER_KEY`, `VERCEL_GATEWAY_KEY`) and `AiCredentialStatus` (`ACTIVE`, `FAILING`, `DISABLED`).
  Additive; no existing row is touched. `BEDROCK_ROLE` is reserved for the AWS role flow (section 10).
- New optional variable `AI_CREDENTIALS_KEY`: 64 hex characters (`openssl rand -hex 32`), no default. It encrypts the
  keys and is the switch. Unset, `POST /ai-settings/credentials` and `POST .../validate` answer 404 and
  `GET /ai-settings` says `byokEnabled: false`; the policy, reading and removing still work. A value that is not 64
  hex characters stops the boot.
- New routes under `/ai-settings` (OWNER writes, ADMIN reads): `GET` (policy, `byokEnabled`, who pays per need, the
  cards), `PATCH policy`, `POST credentials` (`{ type, secret, zdrAttested? }`; the key is tested with one small call
  before anything is stored, and a failure answers 400 with the provider's reason, the key redacted),
  `POST credentials/:credential_id/validate`, `DELETE credentials/:credential_id`. A workspace holds at most 20 keys.
- Routing: when a workspace has a compatible ACTIVE key for a need, that key serves the need and the workspace pays;
  the platform cap does not apply to those calls (section 7). A key that is FAILING, or that the app can no longer
  decrypt, blocks the need with `AiCredentialFailing` (503); the platform key is never used in its place. Under zero
  retention only an Anthropic key the owner attested to counts; the others stay stored but unused. The ledger
  records the credential's public id as `routeId` and its type as `credentialType`.
- The retention policy flip takes effect on the next call (the cached policy is deleted after the commit).
- A daily sweep on `bulk-ops` (`ai-credential-revalidate`) re-tests every ACTIVE or FAILING key, five at a time, in
  two-minute slices. A key that turns FAILING tells owners and admins through the new platform notification type
  `AI_CREDENTIAL_FAILING`; a key that passes again goes back to ACTIVE.
- A provider credit refusal on a workspace key stores the redacted reason as the key's `lastError` and tells owners
  and admins, at most once a day per key. The key stays ACTIVE.
- Five new events: `AI_CREDENTIAL_CONNECTED`, `AI_CREDENTIAL_VALIDATED`, `AI_CREDENTIAL_FAILED`,
  `AI_CREDENTIAL_REMOVED`, `WORKSPACE_RETENTION_POLICY_CHANGED` (external; webhook subscribers can receive them).
- `pnpm --filter @app/backend ai:probe-check` runs the key test against real keys (`ANTHROPIC_API_KEY`,
  `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`), each only when set.

**Who notices.** Nobody until the operator sets `AI_CREDENTIALS_KEY`. Then workspace owners (new routes, a new
notification) and super-admins (tenant-paid rows in AI Spend).

**What to do.**

1. Deploy. The migration is additive and nothing must be set.
2. To turn the feature on, set `AI_CREDENTIALS_KEY` in every environment and keep it safe: losing or changing it
   makes every stored key unreadable, and those workspaces are blocked until they remove and reconnect their keys.
   Boot logs an error with the count of stored keys when the variable is unset.
3. If you subscribe to webhooks by event list, decide whether you want the five new events.

**Rollback.** Revert the change. The table and enums can stay; old code never reads them. Workspaces that connected
keys go back to the platform routes, and their stored keys stay encrypted until the change is redeployed.

## 10. AWS Bedrock: the zero-retention routes

**What changed.** Zero data retention now has somewhere to run. A zero-retention workspace is served by its own AWS
Bedrock role, else its attested Anthropic key (language only), else the platform's Bedrock route when the operator
turns it on, else refused as before. Both Bedrock routes are off by default. No migration: the AWS role columns came
with section 9.

- The model catalog gains `bedrockId`, the US geo cross-region inference profiles from AWS's Bedrock model cards:
  `us.anthropic.claude-haiku-5-5` (`fast`), `us.anthropic.claude-sonnet-5-5` (`standard`),
  `us.anthropic.claude-opus-5-5` (`powerful`). Embeddings on Bedrock use `cohere.embed-v4:0` at 1536 dimensions, the
  same model as Cohere direct. These ids have not yet been proved with a live call (see "What to do").
- Pricing: four `aws` rows (the three models and the embedding model). They mirror the Anthropic and Cohere list
  prices and are marked unverified in `notes`; check them against the Bedrock price page before relying on AI Spend.
- `platform-bedrock` (new platform route): language and embeddings, zero retention, platform-paid, ledger
  `credentialType` `PLATFORM_BEDROCK` and provider `aws`. It sits last, so standard workspaces keep OpenRouter and
  Cohere. It signs with the default AWS credential chain (the ECS task role on a deployed task).
- `BEDROCK_ROLE` (workspace credential): the workspace's own AWS account, through a role it creates that trusts this
  deployment's task role and requires the workspace's external id (`<project>-<workspace public id>`, from
  `PROJECT_NAME`). Nothing secret is stored. Temporary credentials come from STS for one hour at a time.
- New routes (OWNER only; 404 while `AI_CREDENTIALS_KEY` is unset; 503 while `PLATFORM_ASSUME_ROLE_ARN` is unset):
  `POST /ai-settings/credentials/bedrock/begin` returns the external id, the trust policy, a permissions policy
  limited to the catalog's models, a Terraform snippet and the optional CloudFormation link; nothing is stored.
  `POST /ai-settings/credentials/bedrock/complete` takes `{ roleArn, awsRegion }`, assumes the role with the external
  id (must succeed), assumes it without (must be refused with access denied; any other error is a refusal too), makes
  one model call, and only then stores the role. The region must be one the `us.` profiles serve (`us-east-1`,
  `us-east-2`, `us-west-1`, `us-west-2`, `ca-central-1`, `ca-west-1`). "Test again" and the daily sweep re-run the
  same check.
- A Bedrock role stores no secret, so it keeps serving if `AI_CREDENTIALS_KEY` is later removed; only connecting and
  testing stop.
- New optional variables: `PLATFORM_BEDROCK_REGION` (turns `platform-bedrock` on), `PLATFORM_ASSUME_ROLE_ARN`
  (comma-separated; the role a workspace must trust), `PLATFORM_BEDROCK_CFN_TEMPLATE_URL`. A malformed region or ARN
  stops the boot.
- Terraform, off by default: `bedrock_models` (list) adds a Bedrock invoke statement for those models to the task
  role; `bedrock_tenant_roles_enabled` (bool) adds `sts:AssumeRole` on any role to the task role and sets
  `PLATFORM_ASSUME_ROLE_ARN` on the API and worker tasks to the task role's ARN. With both left at their defaults the
  plan is empty.
- New commands, run by hand (they spend money): `pnpm --filter @app/backend ai:ab-gate` (Cohere direct against
  Bedrock vectors; exit 0 pass, 1 diverged, 2 not run, 3 errored) and a `bedrock` leg in `ai:live-check` (runs when
  `PLATFORM_BEDROCK_REGION` is set).

**Who notices.** Nobody until the operator sets a variable. Then zero-retention workspaces stop being refused.

**What to do.**

1. Deploy. Nothing must be set.
2. To serve zero-retention workspaces on the platform's AWS account: enable the three Claude 5.5 models and Cohere
   Embed v4 in the Bedrock console, set the account's Bedrock data retention mode to `none` in that region, set
   `bedrock_models` in Terraform and apply, then run `ai:live-check` with `PLATFORM_BEDROCK_REGION` set. If the
   environment also has `COHERE_API_KEY`, run `ai:ab-gate`; on a measured divergence unset `COHERE_API_KEY` so Bedrock
   is the only embedding route, and record it in the routing ADR. Then set `PLATFORM_BEDROCK_REGION` in Doppler.
3. To let workspaces connect their own AWS account: set `AI_CREDENTIALS_KEY` (section 9) and
   `bedrock_tenant_roles_enabled = true`, and apply. Do not set `PLATFORM_ASSUME_ROLE_ARN` in Doppler: it would
   override the task definition.
4. If a model id does not answer on Bedrock, remove that alias's `bedrockId` from the catalog: the Bedrock routes then
   refuse that alias with a typed error instead of serving another model.

**Rollback.** Unset the variables and set the Terraform variables back to their defaults. A workspace with a stored
role then has its calls refused by AWS (the task role may no longer assume it) until the daily sweep marks the role
FAILING or the owner removes it; it is never moved to a platform route. Reverting the code returns zero-retention
workspaces to being refused, and stored roles are ignored.

## 11. Per-workspace OpenRouter sub-keys

**What changed.** The platform can give each workspace its own OpenRouter runtime key on the platform's OpenRouter
account. Its limit is the workspace's monthly hard AI budget, reset monthly, so OpenRouter refuses that workspace's
calls at its own edge once the cap is spent, and its dashboard shows spend per workspace. The platform still pays:
the ledger still records `platform-openrouter` and `PLATFORM_OPENROUTER`, the platform cap still applies, and a
sub-key is never a workspace credential. Off by default.

- New table `tenant_ai_sub_keys` (migration `tenant_ai_sub_keys`, additive, no backfill): one row per workspace with
  the key as an AES-256-GCM envelope bound to the workspace, OpenRouter's key hash and the last limit sent.
- New optional variable `OPENROUTER_PROVISIONING_KEY`, an OpenRouter management key. Sub-keys run only when it and
  `AI_CREDENTIALS_KEY` (section 9) are both set. With the management key alone, nothing is created: the app logs one
  warning and every workspace keeps the master `OPENROUTER_API_KEY`.
- When keys are created or changed: when a workspace is approved, changes plan, signs up (personal mode), or is the
  single-mode workspace at boot, the budget seeder sets the key's limit to the plan's monthly hard cap, creating the
  key when missing. A workspace whose budget an admin manages keeps its caps; it gets a key at the admin's cap if it
  has none. Saving a budget in AI Spend pushes the new monthly hard cap to the key. These calls never hold up the
  approval, signup, plan change or save, and a failure only logs.
- Calls: `platform-openrouter` uses the workspace's key when one is stored. No row, a key that cannot be decrypted
  (for example `AI_CREDENTIALS_KEY` removed), or a failed read falls back to the master key; a call is never refused
  for it. Embeddings, workspaces paying with their own credential, and the global knowledge base never use a sub-key.
- A key is never left at OpenRouter without the app holding it: if storing a freshly created key fails, it is revoked
  by its hash at once. If that revoke fails, the hash (never the key) is logged at error level; delete that key in
  the OpenRouter dashboard.
- New command, run by hand: `pnpm --filter @app/backend ai:subkey-check` creates a $1 key, changes its cap, reads it
  back and revokes it by hash. It calls the key management API only (no model), and runs only when
  `OPENROUTER_PROVISIONING_KEY` is set.

**Who notices.** Nobody until the operator sets the management key. Then a workspace that spends its monthly cap can
be refused by OpenRouter itself, not only by the ledger check. When OpenRouter answers with a 402 or a credit message,
the call follows the existing credit-refusal path (the budget message, logged at error level for a platform route).
The exact status OpenRouter sends for a spent key limit has not been checked live; `ai:subkey-check` does not spend.

**What to do.**

1. Deploy. Nothing must be set; the table stays empty.
2. To turn sub-keys on: create a management key in OpenRouter (Settings, Provisioning API keys), run
   `ai:subkey-check` with it against a test account, then set `OPENROUTER_PROVISIONING_KEY` in Doppler next to
   `AI_CREDENTIALS_KEY`. Existing workspaces get a key the next time their plan or budget changes, or at the next
   boot in single mode; until then the master key serves them.
3. Never rotate or remove `AI_CREDENTIALS_KEY` while sub-keys exist unless you accept that every workspace falls back
   to the master key (and loses its OpenRouter-side cap) until its row is deleted and re-created.

**Rollback.** Unset `OPENROUTER_PROVISIONING_KEY`: no key is created or changed, but stored keys keep serving their
workspaces at their last limit. To stop using them, delete the rows (`DELETE FROM tenant_ai_sub_keys`) and revoke the
keys in the OpenRouter dashboard. Reverting the code ignores the table; the migration stays.

## 12. The AI Keys settings screen and connect-your-key copy

**What changed.** The web app gains **Settings > AI Keys** (`/settings/ai`) over the `/ai-settings` API of sections
9 and 10. It shows the retention policy (the owner flips it; requiring zero retention is confirmed first), one line
per need saying who pays right now and that spending caps cover only platform-paid usage, and the workspace's own
credentials, each with its status, last four characters (or "No secret stored" for an AWS role), last test, last
error, attestation and an "inert under the current policy" line. The owner adds a credential from a menu (Anthropic,
AWS Bedrock, OpenRouter, Vercel AI Gateway; under zero retention only the first two), pastes a key in a dialog (or
follows the Bedrock sheet), tests one again or removes one. An admin sees it all read-only; a member has no entry.

- With `AI_CREDENTIALS_KEY` unset the Add menu and the credentials section are hidden; stored credentials still show,
  with Remove only. The retention card always shows. In personal mode the page reads "Your AI keys".
- Chat: a turn refused before it streams now shows the server's `detail` instead of a generic "trouble connecting"
  line. When nothing serves chat (`AiNotConfigured`) and when the workspace is over its platform budget, the answer
  links to AI Keys only for the workspace owner on a deployment with `AI_CREDENTIALS_KEY` set; anyone else there is
  told to ask the workspace owner; without the key nobody is offered one.
- The "AI usage limit reached" notification gains a "Connect a key" action (to `/settings/ai`) when
  `AI_CREDENTIALS_KEY` is set.

**Who notices.** Owners and admins see a new Settings entry. Nothing changes for routing, billing or the schema.

**What to do.** Nothing. A product that renamed or moved the Settings sidebar keeps the new entry in
`packages/appshore/web-core/src/shared/lib/navigation.ts`.

**Rollback.** Revert the change. No data is involved.

## 13. Chat stream frames, error paths, citations, conversation history and its cap

**What changed.**

- One frame table. The chat stream's codes live in `STREAM_FRAME` in `@app/shared-types`
  (`ai/assistant-stream.schema.ts`): `0:` text, `8:` card, `9:` suspend, `a:` follow-ups, and three new ones: `c:` a
  source the answer named, `t:` what the assistant is reading (transient), `x:` a terminal error `{ code, detail }`.
  The web reads them in one place, `features/platform/ai-chat/lib/stream-frames.ts`, which skips any code it does
  not know. The store's old fallback for AI SDK `data:` lines is gone; the backend never sent them.
- Errors. Before the first byte a chat or resume request that fails answers the error envelope, as before. After it,
  the stream now ends with one `x:` frame carrying the same `code` and `detail` the envelope would, and the web
  shows the partial answer and then the reason. Before this change a failure after the first byte wrote nothing,
  and a provider error in the middle of an answer was logged and the turn ended as if complete: it now raises and
  ends with `x:`, and the partial answer is not stored as a message. That holds on resume too, including a
  provider error Mastra records on `response.error` instead of throwing, and a credit refusal there keeps
  `AI_BUDGET_EXCEEDED`.
- AI refusal codes. `AiNotConfigured`, `AiCredentialFailing`, `ZeroRetentionUnavailable` and the budget errors
  (including a provider credit refusal) now carry their own `code` on the envelope and the `x:` frame:
  `AI_NOT_CONFIGURED`, `AI_CREDENTIAL_FAILING`, `ZERO_RETENTION_UNAVAILABLE`, `AI_BUDGET_EXCEEDED` (constants in
  `AI_ERROR_CODE`). Before, the envelope carried the generic code for the status (`SERVICE_UNAVAILABLE`,
  `VALIDATION_FAILED`, `PAYMENT_REQUIRED`). Status codes and `detail` are unchanged.
- Citations. The knowledge-base tools (`search-kb`, `get-product-info`) offer the documents they returned as
  citation candidates on a side channel (`_citations`) that the chat strips before the model sees the result. After
  the answer, each candidate whose title (two words or more) the answer names is sent as a `c:` frame and stored on
  the assistant message, at most 8 (`MAX_CITATIONS_PER_MESSAGE`). A citation is `{ sourceType, sourceId, title,
href? }`; knowledge-base documents have no page in the web app, so theirs carry no `href`. History
  (`GET /conversations/:conversation_id/messages`) returns them. External MCP agents calling `search-kb` see the
  `_citations` key in the tool result.
- Conversation history. `DELETE /conversations/:conversation_id` (204) archives a conversation: `isActive = false`,
  rows and messages kept. `GET /conversations` lists only active conversations that have at least one question,
  newest first; `limit` now defaults to and is clamped at 30 (`MAX_ACTIVE_CONVERSATIONS`) instead of defaulting to
  10 with a maximum of 100. Opening the assistant reuses the newest conversation nobody has spoken in instead of
  creating another. After a new conversation is created, every active one past the newest 30 is archived. A missing
  conversation, another person's and another workspace's all answer the same 404 (`This conversation was not
found`). A new event, `CONVERSATION_ARCHIVED` (`app.conversation.archived`, internal), records each archive with
  the reason `user` or `cap`. An archived conversation takes no new turn: a message or a resume into it answers 409
  `INVALID_STATE` (re-activating it on send was rejected: it would silently undo the archive and the cap). Reading its
  messages still works. The web starts a new conversation when the open one is removed.
- The web shows a "Reading …" line while a source is read, a Sources list under an answer that named any, and a
  searchable history (grouped by recency, each conversation removable after a confirmation) in place of the five
  "Recent" rows.

**Schema.** Migration `20261113001000_conversation_message_citations` adds the nullable JSONB column
`conversation_messages.citations`. Additive; existing messages keep null.

**Who notices.**

- Anyone with more than 30 active conversations: the oldest are archived on their next new chat. They leave history;
  nothing is deleted.
- A client that keeps an archived conversation open (a second tab, after the cap archived it) gets a 409 on its next
  message and starts a new conversation.
- A client that branched on the envelope `code` of an AI refusal sees the new AI codes. A client that read only
  `detail` (the web app does) sees no change.
- An older web build against this backend shows the partial answer without the reason (it ignores `x:`, `c:` and
  `t:`); a newer web build against an older backend never sees them. No deploy order is required.

**What to do.** Run `prisma migrate deploy`. A product with its own stream reader skips unknown frame codes; a
product that adds a frame adds it to `STREAM_FRAME` and to the reader in the same change.

**Rollback.** Revert the change. The `citations` column is nullable and can stay; conversations archived by the cap
stay archived (set `is_active = true` to bring them back).

## 14. Knowledge-base retrieval, incremental sync and `kb:eval`

**What changed.**

- Chunking. Files are split at `##` and `###` headings, then packed by paragraph and sentence (about 1,200
  characters, with overlap inside a section). Each stored chunk starts with its title and heading path
  (`Members and roles › Inviting teammates`). The old chunker could store long runs of tiny fragments at the end of
  a document. The chunker carries a version (`CHUNKER_VERSION`); bumping it re-embeds the corpus on the next sync.
- Search. `search-kb` fuses a vector list and an any-term full-text list by reciprocal rank instead of blending
  scores, so a chunk that only matches a keyword can rank, and returns at most two chunks per source file. Terms
  found in more than 30% of chunks are dropped from the full-text list (Postgres ranking has no IDF), except a term
  in three chunks or fewer, so a small corpus still matches. When the query cannot be embedded (no embedding route,
  a zero-retention workspace with no zero-retention route, a failing key, a credit refusal) search answers from
  full-text alone, as before. Results now carry `section` and `sourcePath`.
- Audience. `search-kb` and `get-product-info` no longer take an `audience` argument: the server decides it from the
  caller's role (`kbAudiencesFor` in `knowledge-base/kb-audience.ts`). In the starter every caller reads `all`, and
  the role map (`ROLE_AUDIENCE`) is empty. An external MCP agent that still sends `audience` has it ignored.
  Role audiences need the caller's role injected as `_role` and model-sent `_` keys stripped; section 15 does both,
  so add role audiences only once you have pulled it.
- Content audiences. The loader now accepts only the audiences some role reads: `all`, plus the values of
  `ROLE_AUDIENCE`. The old `user` audience, which only the model could select, is refused at ingest with a message
  naming the valid ones.
- Sync. `pnpm seed:knowledge` is incremental: it compares each file's content hash with the stored one and adds,
  updates, skips or removes files; `--force` re-embeds everything. It embeds before it writes, so a provider failure
  leaves the knowledge base as it was, and it swaps each file's chunks in one transaction under a per-file lock. A
  file whose chunks have no vectors (after section 6 cleared them, or a run with no `COHERE_API_KEY`) is re-embedded
  on the next run that has a route, even when its hash is unchanged. It touches only rows it wrote (a `source_path`);
  a row your product inserted by other means keeps a null `source_path` and is never deleted. Before, every run
  deleted the whole table.
- `embedForPlatform(texts, intent)` now takes the intent. Only the knowledge base calls it.
- `tools/db/migrate.sh` runs `pnpm seed:knowledge` after the base seeds in its full and seed-only modes. Unchanged
  content is a no-op; a failure prints a warning and the run continues. The deploy workflow's migration jobs do not
  run it yet (a later project adds that step), so a deployed environment is synced by running `migrate.sh` against
  it, or `pnpm seed:knowledge` with that environment's `DATABASE_URL`. The command also needs `REDIS_URL`, and it
  embeds only with `COHERE_API_KEY`; it reads both from the environment or from `apps/backend/.env`, so point them at
  the target environment's values.
- `pnpm kb:eval` scores retrieval against `apps/backend/content/kb-eval/golden.json`: recall at 5 and mean
  reciprocal rank, and the questions it missed. It embeds each question on the platform route when `COHERE_API_KEY`
  is set (a small cost; run it by hand) and measures full-text alone otherwise. The mode it reports is counted
  from the run: `hybrid`, `full-text`, or `mixed` with how many queries fell back, so a failing key is not reported
  as hybrid. `--report <folder>`
  writes a dated report to commit. The starter ships three short neutral guides and nine questions over them.

**Schema.** Migration `20261113120000_knowledge_documents_incremental_ingest` adds three nullable columns to
`knowledge_documents` (`source_path`, `content_hash`, `section`) and an index on `source_path`. In the same migration
every existing row gets `source_path = 'legacy:' || COALESCE(parent_doc_id, document_id)`. Every row that exists was
written by the old ingester, which rewrote the whole table on each run; the mark keeps the two-chunks-per-source cap
working until the first sync, and makes the first sync replace them. No `--force` is needed.

**Who notices.**

- A product whose content files say `audience: user`: `pnpm seed:knowledge` refuses them. Change them to `all`.
  Add a role audience to `ROLE_AUDIENCE` only once you have pulled section 15 (see Audience above).
- A product that inserted its own `knowledge_documents` rows: the migration marks them `legacy:` too (it cannot tell
  them apart), so the first sync removes them. Re-insert them afterwards with a null `source_path`; from then on the
  ingester leaves them alone.
- Anyone reading `search-kb` output: the order of results changes, and two chunks per file at most.

**What to do.**

1. Run `prisma migrate deploy`.
2. Rename any `audience: user` in your content.
3. Run `pnpm seed:knowledge` (or `migrate.sh`) in each environment. With `COHERE_API_KEY` set it embeds; without it
   the files are searchable by full-text and the next run with the key embeds them.
4. Optional: replace `content/kb-eval/golden.json` with questions over your content, labelled by reading it, and run
   `pnpm kb:eval` before and after a content or retrieval change.

**Rollback.** Revert the change. The three columns are nullable and can stay; the old ingester ignores them and
rewrites the table on its next run.

## 15. One tool pipeline: argument validation, role and plan, safe errors, no bypass, agent rate limits

**What changed.**

- Every tool call, from chat, the external MCP server and Desk, runs through `InvocationPipelineService` in one
  order: scope, arguments, role, plan, confirmation, audit and execute, errors.
- Arguments. A call's arguments are parsed against the tool's own zod schema before anything runs (defaults applied,
  unknown keys dropped). Bad arguments answer `{ error, code: 'VALIDATION_FAILED', fieldErrors }` with `isError`,
  and nothing runs or is logged. Every `_`-prefixed key a caller sends is dropped first; the executor then injects
  `_tenantId`, `_userId`, `_userDbId` and, new, `_role` (the acting person's `WorkspaceMember` role in the workspace;
  null for Desk), spread last.
- Role. `@RestrictToRoles([...])` on a tool limits it to those workspace roles, read from `WorkspaceMember` for the
  acting person (the chat user, the person an OAuth client acts for, an API key's owner) in the principal's
  workspace. A person with no membership row there is refused on every tool, restricted or not, so an API key or
  OAuth grant whose owner left the workspace stops working through the agent surface. Desk is exempt. A chat
  principal's scopes (chosen by the conversation's persona) are capped at the scopes of the user's current role, so
  a persona above the user's role no longer widens what chat can run.
- Plan. `@RequiresPlanFeature(key)` runs the real `PlanGuard` for the workspace, for every principal kind.
- Role and plan refusals are plain results (`status: 'role_not_permitted'` / `'not_on_plan'` with a `message`), not
  errors, and they come before any confirmation.
- Safe errors. A tool that throws an `HttpException` answers `{ error: <its message>, code: <its code> }`; anything
  else answers `{ error: 'This action failed. Please try again.', code: 'TOOL_FAILED' }` and is logged in full. Raw
  exception text no longer reaches the model or an external agent.
- Bypasses removed. `McpToolService` no longer runs a tool directly when the pipeline is missing or throws (it
  answers `tool_pipeline_unavailable` or the safe failure); `getToolsForNames` is deleted (it had no callers); the
  `context` argument of `getToolsForPersona` / `getToolsetsForPersona` is required; `PipelineError` is deleted.
  `confirm-action` no longer accepts `_invocationSource` and never auto-confirms.
- Write set. The static `WRITE_TOOLS` set is gone: a tool is a write when its `@RequiresScope` is not read tier.
  Chat now offers `confirm-action` as soon as one registered tool has a write scope.
- Desk's audit rows now record the tool's tier (`standard` for a standard write; it was `none`). Desk is still never
  challenged by the pipeline; its gate step is unchanged.
- `tools/list` builds every input schema with `toolInputSchema`: every `_` property stripped, `_confirmToken`
  documented in neutral wording.
- Agent rate limits. An OAuth client's per-minute budget is now per client and person
  (`oauth:<clientId>:<userId>`), so one popular connector no longer shares 120 calls a minute across every user in
  every workspace. OAuth clients and API keys of one workspace also share a ceiling,
  `AGENT_TENANT_CEILING_PER_MINUTE` (default 600). The 429 body is the error envelope with `code: 'RATE_LIMITED'` and
  a `detail` that names which budget ran out; the limit and wait stay in `X-RateLimit-*` and `Retry-After`.
- Example tools. `list-support-tickets` (`platform:read`) and `create-support-ticket` (`platform:write`,
  `@RestrictToRoles(MEMBER, ADMIN, OWNER)` like `POST /support/tickets`) in `mcp/tools/support-ticket.tool.ts`. The
  file says how to delete it.

**Env.** New, optional: `AGENT_TENANT_CEILING_PER_MINUTE` (zod `edge.agentTenantCeilingPerMinute`, default 600).

**Schema.** None.

**Who notices.**

- A product tool that returned `{ error: err.message }` or relied on its raw exception text reaching the model: the
  model now sees the generic message for anything that is not an `HttpException`. Throw the service's
  `HttpException` instead.
- A product tool that declared a `_`-prefixed parameter or read one the model sent: it is dropped. Take identity
  from the injected params only.
- A product that added names to `McpToolService.WRITE_TOOLS`: the set is gone; give the tool a write scope.
- A product that called `getToolsForNames`, `getToolsForPersona` without a context, or caught `PipelineError`:
  those are gone.
- A product with a role-tagged knowledge-base audience waiting on section 14: it now works.
- An external agent holding a challenge token from before the deploy: the challenge digest is now taken over the
  parsed arguments (defaults applied, unknown keys dropped), so a replay of such a token may no longer match. It
  fails closed (`hitl_invalid_or_expired`); call again for a new token. Tokens expire within minutes anyway.
- An API key or OAuth grant whose owner has no `WorkspaceMember` row in the key's workspace: every tool call now
  answers `role_not_permitted`. Re-add the person or issue a new key from a current member.
- Heavy users of one OAuth connector: each person now has their own 120-a-minute budget, under the workspace's
  ceiling of 600.

**What to do.**

1. For each of your tools, add `@RestrictToRoles` and `@RequiresPlanFeature` matching its REST twin's `@Roles` and
   `@RequireFeature`.
2. Replace any `return { error: e.message }` in a tool with a thrown `HttpException`.
3. Optional: set `AGENT_TENANT_CEILING_PER_MINUTE`.
4. Optional: delete the example pair (see the header of `support-ticket.tool.ts`).

**Rollback.** Revert the change. Nothing is stored differently.

## 16. Confirmations bound to the exact write: one intent digest, single use, challenge retention

**What changed.**

- One digest. A challenge token is bound to `intentDigest(schema, args)` in `agent-contract/intent-digest.ts`: the
  caller's top-level `_` keys dropped, the rest parsed through the tool's zod schema (defaults applied, unknown keys
  dropped), canonical JSON with keys sorted at every depth, SHA-256 over the exact values. The old digest hashed the
  redacted copy with the top-level keys as a `JSON.stringify` allow-list, so `{ invoice: { amount: 5 } }` and
  `{ invoice: { amount: 500 } }` matched, and so did two different email addresses. `digestArgs` is deleted.
  `redactArgs` stays, for the invocation log only; the log's `argsDigest` column is now a sorted-at-every-depth
  hash of that redacted copy (a log fingerprint, never used to authorise).
- Single use. A token is spent with a conditional update (`consumed_at IS NULL`); of two racing replays of one
  token, one runs and the other answers `hitl_invalid_or_expired`. Before, both could run the write.
- Step-up. `POST /mcp/hitl/:token/step-up` marks only an open challenge (unused, unexpired, not already stepped up,
  for the person it names). Otherwise it answers 404 `Challenge not found, already used or expired`. Before, it
  marked a used or expired challenge as stepped up and answered success.
- Retention. The `data-retention` job deletes `hitl_challenges` rows 24 hours after `expiresAt`. Its summary gains
  `hitlChallengesDeleted`. Before, nothing deleted them.

**Env.** None. **Schema.** None.

**Who notices.**

- An external agent holding a challenge token issued before the deploy: its digest no longer matches, so the replay
  fails closed (`hitl_invalid_or_expired`). Call again for a new token. Open tokens expire within ten minutes.
- An agent that re-sent a confirmed call with a changed value inside a nested object or a redacted-looking field:
  that is now a different call and needs a new challenge.
- Anything that read `hitl_challenges` rows older than a day after expiry: they are gone after the next retention run.
- A product that imported `digestArgs`: use `intentDigest` for a confirmation, or `sha256Canonical` for a fingerprint.

**What to do.** Nothing.

**Rollback.** Revert the change. Nothing is stored differently; rows the retention job already deleted stay deleted.

## 17. Chat writes need the person's confirmation of that exact call

**What changed.**

- Server-side confirmation in chat. A signed-in user's write through the assistant runs only against a grant: the
  card the person confirmed for that tool and those exact arguments (`intentDigest`) in that conversation. With no
  grant the tool answers `{ status: 'confirmation_required' }` and changes nothing. Before, the pipeline skipped
  confirmation for every chat call, and the only gate was the model choosing to call `confirm-action`.
- `confirm-action` takes `{ tool, args }`: the write tool and its exact arguments. The server checks it is a write
  the person could run (scope, arguments, role, plan), records the intent and builds the card from the recorded
  tool and arguments, never from model prose. The old inputs (`action`, `description`, `entityId`, `entityType`)
  are gone; the `confirmActionTool` export is replaced by `createConfirmActionTool(recorder)`, built per request.
- The `9:` frame is the server card: `action`, `description`, `tool`, `args`, `toolCallId`, `runId`. Mastra's
  suspend envelope is unwrapped (`buildConfirmFrame`), so the model's own confirm-action input never reaches the
  card. `entityId` and `entityType` are no longer in the frame.
- `POST /conversations/:conversation_id/resume` confirms exactly the card named by `toolCallId`, once. A second
  press, an expired card or an unknown one answers 409 `INVALID_STATE` and resumes nothing; a Confirm with no
  `toolCallId` answers 400 naming `toolCallId`. Cancel voids the card. When the resumed turn ends, unspent grants
  are voided; a new user message voids every open card in the conversation.
- The user principal gains an optional `conversationId` (`fromUser({ ..., conversationId })`), and the executor
  injects `_conversationId` (null outside chat) last in the spread, with the other server identity params.
- A delegated sub-agent (`execute`) gets a read-only toolset: no write tool and no `confirm-action`.
- A chat grant is never a challenge token: `consume`, `POST /mcp/hitl/:token/step-up` and `GET /mcp/hitl/:token`
  read only rows with no conversation. (Section 18 folds `GET /mcp/hitl/:token` into `GET /agent-actions/:token`,
  which keeps the same rule.)
- The web `ConfirmationCard` shows the exact arguments, offers Confirm and Cancel only on the card the agent is
  waiting on, and marks a card "no longer waiting" on a 409.

**Env.** None.

**Schema.** Migration `hitl_chat_grants`: three nullable columns on `hitl_challenges` (`conversation_id`,
`tool_call_id`, `confirmed_at`) and an index on `(tenant_id, conversation_id)`. Additive; existing rows keep null.

**Who notices.**

- A product with its own write tools: chat writes now need the card. A product prompt that told the model to call
  `confirm-action` with `action` / `description` / `entityId` / `entityType` must name `tool` and `args` instead
  (the shipped fallback prompt does). A model that skips the card gets `confirmation_required`.
- A client other than the shipped web app that resumes a run: send the card's `toolCallId` on Confirm, and expect
  409 on a second press. A mobile or custom client that read `entityId` / `entityType` from the `9:` frame reads
  `tool` and `args` instead.
- A tool that read a caller-sent `_conversationId`: the pipeline already dropped it; it now gets the server's.
- A conversation suspended on a card raised before the deploy: that card has no recorded intent, so Confirm answers 409. Ask again.

**What to do.** Update product prompts that describe `confirm-action`'s inputs. Nothing else.

**Rollback.** Revert the change. The three columns are nullable and can stay; old code ignores them.

## 18. External agent writes wait for a person: the approval page and the self-confirm switch

**What changed.**

- An OAuth client or API key calling a standard write no longer self-confirms by default. It answers
  `{"status":"approval_required","token","ttlSeconds","approvalUrl"}` and runs nothing. The person the agent acts
  for, or an owner or admin of that workspace, opens `approvalUrl` (`APP_URL/agent-actions/<token>/approve`) and
  approves or denies it. The agent then repeats the call with the same arguments plus `_confirmToken`, and it runs
  once. A request waits up to an hour; after an approval the agent has at least 15 minutes to retry.
- A retry the person has not decided yet answers `approval_pending` (with the link); a denied one answers
  `approval_denied`. Neither spends the token. Unknown, expired, used or mismatched tokens still answer
  `hitl_invalid_or_expired`.
- A sensitive write still needs the PIN of the person the agent acts for, whatever the policy says. The same page
  now serves it: the redacted arguments and a PIN field that posts to `POST /mcp/hitl/:token/step-up`. That route
  now allows 5 attempts per signed-in user per 15 minutes (the PIN login's limit) instead of the global limit, so a
  4-digit PIN cannot be guessed inside a request's window; a sixth attempt answers 429.
  A person with no PIN set is sent to Settings > Profile and brought back after saving one. The Approve button never
  unlocks a sensitive write; Deny works for both kinds. A retry before the PIN answers `approval_pending` (it was
  `hitl_invalid_or_expired`).
- `Tenant.agentSelfConfirm` (default false) is the owner's switch back to the old flow for standard writes
  (`hitl_required` with no link; repeat the call with the token). `GET /agent-policy` (owner, admin) and
  `PUT /agent-policy` (owner) read and set it; the owner's row is on Settings > AI Assistants.
- New routes: `GET /agent-actions/:token` (the tool, tier, caller, the person acted for, the expiry, whether the
  viewer has a PIN, and the arguments: the exact ones on an approval request, the redacted ones on a PIN request),
  `POST /agent-actions/:token/approve`, `POST /agent-actions/:token/deny`. A second decision, or a decision on an
  expired or used request, is 409. Only the person acted for or an owner or admin of the workspace may open a
  request (403 for other members, 404 for another workspace).
- Removed: `GET /mcp/hitl/:token`. `GET /agent-actions/:token` replaces it. No caller in the web app, the mobile app
  or the QA suite used it.
- The pipeline reads `APP_URL` through `ConfigService` for the link. With `APP_URL` unset, no `approvalUrl` is
  sent.
- `argsPreview` (the exact arguments an approver sees) may hold personal data. It is stored only on an approval
  request, readable only by the people above, never logged, and set to null once the request is spent or denied.
  The challenge row itself is deleted a day after it expires (section 16).
- Events: `AGENT_ACTION_APPROVED`, `AGENT_ACTION_DENIED` and `WORKSPACE_AGENT_POLICY_CHANGED` (external; webhook
  subscribers can receive them). They carry the token, tool and caller name, or the new policy; never the
  arguments.

**Env.** No new variable. `APP_URL` (already read for email and invitation links, and in `apps/backend/.env.example`)
must be set where agents should get a link. The shipped Terraform does not set it; a product sets it the way it sets
its other web links.

**Schema.** Migration `agent_action_approval`: on `hitl_challenges`, `approval_required` (default false),
`args_preview`, `args_redacted`, `approved_at`, `denied_at`, `decided_by_id`; on `tenants`, `agent_self_confirm`
(default false). Additive; existing rows keep their defaults.

**Who notices.**

- Every product with external agents: their standard writes now wait for a person. An agent built against the old
  flow that repeats the call at once will get `approval_pending` until someone approves.
- Anyone who called `GET /mcp/hitl/:token`: call `GET /agent-actions/:token` instead (camelCase body, see above).
- A challenge issued before the deploy keeps `approval_required = false` and finishes on the old flow; it expires
  within ten minutes.

**What to do.** Tell workspace owners about the new default. An owner who wants the old behaviour turns on "Let
agents confirm their own changes" on Settings > AI Assistants. Set `APP_URL` in every environment that serves agents.

**Rollback.** Expire the open requests first, then revert. The old code's token check knows nothing about approvals
or denials: it lets an agent spend any open token for its own call by repeating it with `_confirmToken`. Without the
step below, every request still waiting (nobody approved it) and every request a person denied runs on its agent's
next retry, for up to an hour (`APPROVAL_TTL_SECONDS`).

1. Just before the rollback, run:

   ```sql
   UPDATE hitl_challenges SET expires_at = now()
   WHERE consumed_at IS NULL AND (approval_required OR denied_at IS NOT NULL);
   ```

2. Deploy the old code.
3. Run the same statement again once only the old code is serving. Requests created by the new code between steps 1
   and 2 are caught here; the old code never sets `approval_required`, so nothing it creates is touched.

Agents whose requests were expired get `hitl_invalid_or_expired` and ask again on the old flow. The new columns have
defaults or are nullable and can stay; old code ignores them.

## 19. Retry-safe tool creates: `idempotencyKey`

**What changed.**

- A tool that declares `idempotencyKey` in its schema (`idempotencyKeyArg` in
  `apps/backend/src/domains/ai/agent-contract/tool-idempotency.ts`) gets replay protection from the tool executor.
  An agent that retries a create with the same key and the same arguments within 24 hours gets the first call's
  result back, and nothing is created twice. It is the same Redis store the `Idempotency-Key` header uses, scoped to
  the workspace and the person the call acts for. The same key on a different call answers
  `IDEMPOTENCY_KEY_REUSED`; a retry while the first call still runs answers `IDEMPOTENCY_KEY_IN_USE`; a failed call
  frees its key. If Redis cannot be reached the call runs without the key.
- The example write `create-support-ticket` declares it. Its `tools/list` input schema gains an optional
  `idempotencyKey` string (1 to 255 visible ASCII characters; a UUID is ideal).
- The key is an argument like any other for confirmation: an approval or a chat card is bound to it. The chat card
  leaves it out of its description.
- `ScopeRegistryService.resolveProvider` also returns the tool's `parameters`.

**Env.** None. **Schema.** None.

**Who notices.**

- An agent calling `create-support-ticket` sees one new optional argument. A call without it behaves as before.
- A confirmed write still needs a confirmation per call: a retry after the token or grant was spent is challenged
  again, and once confirmed it replays the first result instead of creating a second record.
- A product that constructs `ToolExecutorService` by hand (in a spec): it takes an `IdempotencyStore` as a fourth
  argument.

**What to do.** For each of your own create tools that has no natural key, add `idempotencyKey: idempotencyKeyArg`
to its parameters and list it in `IDEMPOTENT_CREATE_TOOLS` in `tool-idempotency.spec.ts`. Nothing else.

**Rollback.** Revert the change. Remembered results live in Redis for 24 hours and are ignored by the old code.

## Deploy order for `ai_reader`

A later change in this project adds the migration `drop_ai_reader_role`, which revokes the role's grants and drops
it. Old tasks run `SET LOCAL ROLE ai_reader` on every tool call, so that migration must not run while any task on
the old code is still serving. Deploy every change before it (at least section 2 above) in every environment
first, and only then pull the change that drops the role. Pulled in one deploy, both migrations would run while old
tasks still switch to the role.
