# ADR-0005 — AI provider routing is per tenant; retention is enforced in the resolver

**Date:** 2026-11-12 · **Status:** Adopted.

## Context

The starter got its models from one process-wide provider (`ai-provider.ts`). An environment variable
(`AI_PROVIDER`) picked the vendor for every tenant at once, and the code defaulted to the Vercel AI Gateway while the
docs said Anthropic. Retention, though, is a property of the tenant (`Tenant.aiZeroRetention`), and only one caller
checked it: structured output. Chat, the skill classifier, feedback summaries and embeddings sent a zero-retention
tenant's text to a retaining provider. With one process-wide provider there was also no way for a workspace to bring
its own key, and the ledger could not say who paid for a call.

One root cause: provider choice was a process constant, while retention and payment are per tenant.

## Decision

1. **One way to get a model: `AiRouteResolver.resolve(tenantId, need)`** (`apps/backend/src/domains/ai/routing/`).
   A need is `language` (by alias: `fast`, `standard`, `powerful`) or `embedding`. Every consumer (chat, structured
   output, the skill classifier, feedback, Desk steps and memory, the knowledge base) gets its model from a resolved
   route. There is no other provider, so a consumer that skips the resolver has no model at all.
   `resolvePlatform(need)` is the one other entry, for platform-owned content with no tenant (the global knowledge
   base): platform routes only, standard retention, no tenant ledger row.
2. **Retention is filtered inside the resolver, fail-closed.** A route that does not fit the tenant's policy is
   treated as absent. When nothing fits, the call is refused with `ZeroRetentionUnavailable` (400, and the
   `AI_ZERO_RETENTION_UNAVAILABLE` signal) when a route existed but the policy excluded it, or `AiNotConfigured`
   (503) when nothing serves the need. A tenant is blocked, never downgraded to a retaining route.
3. **A pool has one payer.** It is the tenant's credentials or the platform's routes, never both, decided per need.
   A tenant credential that would serve the need but is failing blocks the call (`AiCredentialFailing`, 503); the
   platform's key never stands in for a tenant's. A credential the retention policy rules out is inert (absent); a
   DISABLED one is absent too. When any compatible ACTIVE credential exists the tenant pays and the first by
   `priority` serves; a stored secret that cannot be decrypted is refused the same way as a failing one.
4. **Platform routes are configured by environment, never the database**, and each is off until its key is set:
   `platform-openrouter` for language (`OPENROUTER_API_KEY`) and `platform-cohere` for embeddings
   (`COHERE_API_KEY`). The Vercel AI Gateway is not a platform route: its fallback to system credentials cannot be
   turned off and persists under zero-retention headers. It may come back only as a tenant key type, at standard
   retention, pinned to Anthropic. `ANTHROPIC_API_KEY` is not a platform route either; it is a developer's test key.
5. **Model ids live in one catalog** (`model-catalog.ts`): one row per alias, one id column per route family. A
   model bump is that file plus pricing rows. No other file writes a model id (`model-id-literals.spec.ts`).
6. **Embeddings are pinned to Cohere Embed v4 at 1536 dimensions** on every route, the only model on both a
   zero-retention route (Bedrock) and a public one (Cohere direct); `vector(1536)` stays. Every call names an intent
   (`document` when storing, `query` when searching), sent as Cohere's input type, and every vector is
   dimension-checked before it can reach a `vector(1536)` column.
7. **Zero-retention capability is per model.** The catalog marks each alias `zdrCapable`; a zero-retention tenant
   asking for an alias that is not capable is refused at the model getter.
8. **Chat agents take their model per request.** An agent has no default model: the call site resolves the route
   and passes the model in the Mastra `RequestContext` (`REQUEST_MODEL_KEY`); an agent invoked without one fails.
9. **The ledger records the route.** Every `ai_invocations` row carries `route_id` and `credential_type`, so the
   payer rule is auditable per call.

## How the starter differs from the product it was ported from

- Code under `domains/ai/routing/` reads its keys through the zod config schema (`ConfigService`), never
  `process.env` (`ai-routing-config.spec.ts`).
- Provider packages (`@ai-sdk/*`, `@openrouter/*`, `openai`) and `createGateway` are imported only under
  `domains/ai/routing/` and `domains/ai/moderation/` (`ai-provider-clients.spec.ts`).
- The port had no vectors when it switched embedding models; a product scaffolded from the starter may. The change
  clears both vector columns (migration `clear_embedding_vectors`) and re-embeds: `pnpm seed:knowledge` for the
  knowledge base, and `pnpm --filter @app/backend ai:reembed-desk-memory` for Desk memory when the product kept Desk.
  Until then, knowledge-base search answers from full-text, and memory recall scores without the semantic term.
- Command-line processes (the two above) use `AiRoutingStandaloneModule`, the same resolver without the app's event
  bus: the zero-retention signal is dropped there (the refusal still throws), and ledger events stay in the outbox
  for the app's relay.
- External moderation (OpenAI) stays a platform call on `OPENAI_API_KEY`, skipped for a zero-retention tenant; the
  local guardrails still run.
- Bring-your-own-key is switched on by its own key, `AI_CREDENTIALS_KEY` (64 hex characters, no default, no
  fallback; a malformed value stops the boot). The port has no switch and answers 500 on first use without its key.
  Unset, connecting or testing a key answers 404, and reading the settings, removing a key and the retention policy
  still work. The tenant secret is an AES-256-GCM envelope bound to `tenantId:credentialPublicId`, in its own cipher
  (`CredentialCryptoService`), not the integrations cipher (which has a development default and no binding).
- The paste-key types are `ANTHROPIC_KEY`, `OPENROUTER_KEY` and `VERCEL_GATEWAY_KEY` (the gateway pinned to
  Anthropic, priced as Anthropic). `BEDROCK_ROLE` is in the enum but serves nothing until the AWS role flow lands.
- A provider credit refusal on a tenant's own key records the redacted reason on the credential and tells its owners
  at most once a day; the status stays ACTIVE, because a low-credit key can still pass the test. The port has no such
  path.
- The daily revalidation sweep works in two-minute slices on the shared `bulk-ops` lane and hands over to one
  continuation job, so the outbox relay and the deadline sweeper are never held behind it for long.
- A workspace holds at most 20 credentials (`MAX_AI_CREDENTIALS_PER_WORKSPACE`), so every read of them is bounded.

## Consequences

- `ai-provider.ts`, `AI_PROVIDER` and `AI_GATEWAY_API_KEY` are gone. A retired variable still set earns one boot
  warning and is otherwise ignored.
- A deployment with no key boots: AI answers `AiNotConfigured` and everything else works. At boot the routing module
  logs one line per need (`language: platform-openrouter`, `embedding: none`).
- A zero-retention tenant is served by its own Bedrock role, else its attested Anthropic key (language only), else
  `platform-bedrock` once the operator sets `PLATFORM_BEDROCK_REGION`, else refused; knowledge-base search still
  works for it on full-text.
- Dev mirrors production: there is no special dev provider.
- Bring-your-own-key added the tenant pool and three registry entries without reshaping the resolver; the Bedrock
  routes (`platform-bedrock` and `BEDROCK_ROLE`) added two more the same way, and per-workspace OpenRouter sub-keys
  will too.
- A workspace Bedrock role is assumed with the backend's own task-role credentials, never through an intermediate
  role: the role a workspace trusts (`PLATFORM_ASSUME_ROLE_ARN`) is the role that calls. Both Bedrock routes sign
  through the default AWS credential chain. Connecting a role checks it both ways: with the external id the assume
  must succeed, without it the assume must be refused with access denied.
- Removing `AI_CREDENTIALS_KEY` while workspaces hold keys blocks those workspaces (`AiCredentialFailing`), never
  moves them to the platform key; boot logs an error with the count of stored credentials.
- Open: the embedding A/B gate (`ai:ab-gate`, whether Cohere direct and Bedrock produce interchangeable vectors) has
  shipped but has not been run for the starter: it needs AWS credentials and spends money. Until an operator runs it
  and records the result here, run it before enabling `platform-bedrock` beside `COHERE_API_KEY`; on a measured
  divergence Bedrock becomes the only embedding route.
