---
owner: foundation
status: interim
pending: F3
sources:
  - docs/adr/0005-ai-provider-routing-per-tenant.md
  - apps/backend/src/domains/ai/routing/ai-route-resolver.service.ts#AiRouteResolver
  - apps/backend/src/domains/ai/routing/model-catalog.ts#MODEL_CATALOG
  - apps/backend/src/domains/ai/routing/route-registry.ts#TENANT_CREDENTIAL_CAPABILITIES
  - apps/backend/src/domains/ai/routing/output-ceilings.ts#OUTPUT_CEILINGS
  - apps/backend/src/domains/ai/routing/prompt-cache.ts
  - apps/backend/src/domains/ai/routing/credential-crypto.service.ts#CredentialCryptoService
  - apps/backend/src/domains/ai/routing/connect
  - apps/backend/src/domains/ai/routing/provisioning
  - apps/backend/src/domains/ai/routing/aws-role-naming.ts
  - apps/backend/src/domains/ai/infrastructure/telemetry/usage-from-ai-sdk.ts#usageFromAiSdk
  - apps/backend/src/domains/ai/infrastructure/telemetry/platform-paid.ts#PLATFORM_PAID_SQL
  - apps/backend/src/domains/ai/infrastructure/telemetry/ai-provider-credit-refused.error.ts#mapProviderRefusal
guards:
  - model-catalog.spec.ts
  - model-id-literals.spec.ts
  - route-registry.parity.spec.ts
  - ai-provider-clients.spec.ts
  - ai-routing-config.spec.ts
  - model-calls-name-a-ceiling.spec.ts
  - bedrock-ambient-credentials.spec.ts
---

# AI routing: aliases and the catalog, the resolver, tenant keys, OpenRouter, the payer rule, cost

Moved from the old backend skill; condensed with its recipes in its finish pull request. The decision is the ADR "AI
provider routing is per tenant", `docs/adr/0005-ai-provider-routing-per-tenant.md`. The call paths that use a route
are in [`ai.md`](ai.md); tools in [`ai-tools.md`](ai-tools.md).

| Alias      | Use for                                                         |
| ---------- | --------------------------------------------------------------- |
| `fast`     | Classification, short summaries, memory extraction (effort low) |
| `standard` | Chat, structured extraction (effort medium)                     |
| `powerful` | Complex extraction, the fallback for critical tasks             |

## Rules

### The resolver and the catalog

- The resolver is the only way to get a model: `AiRouteResolver.resolve(tenantId, need)` (`'language'` or
  `'embedding'`) picks the tenant's route, applies its retention policy and fails closed with a typed error:
  `AiNotConfigured` (503, nothing serves the need), `ZeroRetentionUnavailable` (400, the tenant requires zero retention
  and the route keeps data), `AiModelNotOnRoute` (503, no id for that alias on that route). Never catch one to fall back
  to another provider. `resolvePlatform(need)` is only for platform-owned content with no tenant.
  [guard: ai-provider-clients.spec.ts]
- Code names an alias, never a model id. Ids live only in `MODEL_CATALOG`
  (`apps/backend/src/domains/ai/routing/model-catalog.ts`): one row per alias, one id per route family. A model bump is
  a change there plus pricing rows, never an env var. [guard: model-id-literals.spec.ts, model-catalog.spec.ts]
- Provider packages (`@ai-sdk/<provider>`, `@openrouter/*`, `openai`) and `createGateway` are imported only under
  `apps/backend/src/domains/ai/routing/` (the route registry builds every client) and `domains/ai/moderation/`. The
  `ai` package (`generateText`, `embed`) is fine anywhere: it calls the model it is handed.
  [guard: ai-provider-clients.spec.ts]
- Routing reads its keys through `ConfigService`, never `process.env`. [guard: ai-routing-config.spec.ts]
- Every model call names an output ceiling from `OUTPUT_CEILINGS`: `maxOutputTokens` on every `extract` and AI SDK
  call, `modelSettings.maxOutputTokens` on Mastra agent calls. Thinking is billed as output, so no ceiling is below
  1,024. [guard: model-calls-name-a-ceiling.spec.ts]
- Prompt caching is the route's: each registry entry declares `promptCache` and the resolver wraps its language models
  (`routing/prompt-cache.ts`). Never set `cacheControl` by hand. [review-only: no spec scans messages for it]

### Cost

- Usage is read through `usageFromAiSdk` for every AI SDK or Mastra result: it reads cache reads and writes on each
  provider's shape and sums a multi-step run. Never read `usage.inputTokens` by hand. [guard: usage-from-ai-sdk.spec.ts]
- The AI budget counts platform-paid spend only. The platform paid when `credentialType` is null or starts with
  `PLATFORM_`; the one statement is `PLATFORM_PAID_SQL` / `payerOf` in `telemetry/platform-paid.ts`.
  [guard: ai-budget-payer.integration.spec.ts]
- Check the cap only when the platform pays: `if (route.payer === 'PLATFORM') await aiTelemetry.assertBudget(tenantId)`,
  after resolving and before the call. A workspace on its own key is never capped.
  [guard: ai-budget-payer.integration.spec.ts]
- A provider credit refusal is a budget error: in a model call's catch, `throw mapProviderRefusal(err, tenantId, route)`.
  [guard: ai-provider-credit-refused.error.spec.ts]
- Budgets come from the plan: `AiBudgetSeederService` writes a workspace's caps from `PLAN_AI_BUDGETS` and owns a row
  only while `notes` starts with `plan:`. Never write a `plan:` note from anywhere else. [review-only: needs reading]
- With sub-keys on (`OPENROUTER_PROVISIONING_KEY` and `AI_CREDENTIALS_KEY`), each workspace calls
  `platform-openrouter` with its own key, capped at its monthly hard budget. Code that writes
  `TenantAiBudget.monthlyHardUsd` calls `OpenRouterProvisioningService.syncLimit(tenantId, cap)` after the write, not
  awaited. A sub-key is platform-paid and never in the tenant pool. [review-only: needs reading]

### Workspace credentials (bring your own key)

- A secret is never read back. A pasted key exists only inside `AiCredentialConnectService.connectKey`; it is stored as
  the `CredentialCryptoService` envelope (AES-256-GCM, bound to the tenant and the credential's public id) and leaves
  the API only as `lastFour`, through `toAiCredentialSummary`. Provider error text passes through `redactSecret`.
  Events carry the public id and type only. [guard: credential-crypto.service.spec.ts]
- A failing workspace key is never served on the platform key: a pool is the workspace's credentials or the platform's
  routes, never both. A compatible credential that is failing, or cannot be decrypted, raises `AiCredentialFailing`
  (503); never catch it to retry on a platform route. A credential the retention policy rules out is inert, never
  deleted. [guard: ai-route-resolver.payer-boundary.spec.ts]
- Status moves only through a test: `validate` (and the daily sweep that calls it) is the only writer of ACTIVE and
  FAILING. A credit refusal on a workspace key is recorded through `route.reportCreditRefusal` and leaves it ACTIVE.
  [review-only: needs reading]
- Whether bring-your-own-key is on is `CredentialCryptoService.isConfigured()` (the `AI_CREDENTIALS_KEY` switch); there
  is no other flag and no fallback key. [guard: credential-crypto.service.spec.ts]
- A new credential type is an `AiCredentialType` value plus a `TENANT_CREDENTIAL_CAPABILITIES` entry (what it serves,
  retention, prompt cache, a builder that reaches the provider only through the catalog).
  [guard: route-registry.parity.spec.ts]
- A workspace AWS role is assumed with the backend's own ambient credentials (the task role the workspace's trust
  policy names), never through another role. The external id is recomputed on the server (`aws-role-naming.ts`), and a
  role is stored only after the two-direction check passes. [guard: bedrock-ambient-credentials.spec.ts]

## Flag in review

- A model id outside the catalog, or an env var that holds one.
- A provider client built outside `domains/ai/routing/`.
- A caught `AiNotConfigured` or `AiCredentialFailing` followed by a call on another route.
- A model call with no output ceiling.
- A budget check on a workspace-paid route, or none on a platform-paid one.
- A credential secret in a response, a log line or an event.
