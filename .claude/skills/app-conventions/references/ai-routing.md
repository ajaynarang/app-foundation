---
owner: foundation
sources:
  - docs/adr/0005-ai-provider-routing-per-tenant.md
  - apps/backend/src/domains/ai/routing/ai-route-resolver.service.ts#AiRouteResolver
  - apps/backend/src/domains/ai/routing/model-catalog.ts#MODEL_CATALOG
  - apps/backend/src/domains/ai/routing/route-registry.ts#PLATFORM_ROUTES
  - apps/backend/src/domains/ai/routing/route-registry.ts#TENANT_CREDENTIAL_CAPABILITIES
  - apps/backend/src/domains/ai/routing/output-ceilings.ts#OUTPUT_CEILINGS
  - apps/backend/src/domains/ai/routing/prompt-cache.ts#withPromptCache
  - apps/backend/src/domains/ai/routing/model-tuning.middleware.ts#tunedLanguageModel
  - apps/backend/src/domains/ai/routing/credential-crypto.service.ts#CredentialCryptoService
  - apps/backend/src/domains/ai/routing/connect
  - apps/backend/src/domains/ai/routing/provisioning
  - apps/backend/src/domains/ai/routing/aws-role-naming.ts#bedrockExternalId
  - apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts#extract
  - apps/backend/src/domains/ai/infrastructure/telemetry/usage-from-ai-sdk.ts#usageFromAiSdk
  - apps/backend/src/domains/ai/infrastructure/telemetry/platform-paid.ts#PLATFORM_PAID_SQL
  - apps/backend/src/domains/ai/infrastructure/telemetry/ai-provider-credit-refused.error.ts#mapProviderRefusal
  - packages/appshore/db/prisma/seeds/08-model-pricing.seed.ts
guards:
  - ai-provider-clients.spec.ts
  - ai-route-resolver.service.spec.ts
  - ai-route-resolver.payer-boundary.spec.ts
  - ai-route-resolver.subkey.spec.ts
  - model-catalog.spec.ts
  - model-id-literals.spec.ts
  - route-registry.parity.spec.ts
  - ai-routing-config.spec.ts
  - model-calls-name-a-ceiling.spec.ts
  - output-ceilings.spec.ts
  - model-tuning.middleware.spec.ts
  - prompt-cache.spec.ts
  - ai-call-paths.spec.ts
  - usage-from-ai-sdk.spec.ts
  - ai-budget-payer.integration.spec.ts
  - ai-provider-credit-refused.error.spec.ts
  - ai-budget-seeder.service.spec.ts
  - credential-crypto.service.spec.ts
  - ai-credential.serializer.spec.ts
  - redact-secret.spec.ts
  - ai-credential-connect.service.spec.ts
  - bedrock-ambient-credentials.spec.ts
examples:
  - platform-mistral
  - PLATFORM_MISTRAL
  - mistralApiKey
---

# AI routing: aliases and the catalog, the resolver, tenant keys, OpenRouter, the payer rule, cost

The decision is the ADR "AI provider routing is per tenant", `docs/adr/0005-ai-provider-routing-per-tenant.md`. The
call paths that use a route are in [`ai.md`](ai.md); tools in [`ai-tools.md`](ai-tools.md).

Code names an alias. The catalog maps it to one id per route family; effort is the catalog's too.

| Alias      | Use for                                                     | Effort |
| ---------- | ----------------------------------------------------------- | ------ |
| `fast`     | Classification, a word or label, short summaries            | low    |
| `standard` | Chat, structured extraction                                 | medium |
| `powerful` | Complex extraction; the alias a refused call retries one up | medium |

Who serves a need (`'language'` or `'embedding'`), in the resolver's order:

| The workspace has                                   | Pool     | Serves                                                                                                          |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| An ACTIVE credential that serves the need           | TENANT   | The first by `priority`; the workspace pays, no platform cap                                                    |
| Only FAILING ones (or a secret that cannot decrypt) | none     | `AiCredentialFailing` (503); never the platform key                                                             |
| No credential for the need (DISABLED is absent)     | PLATFORM | `platform-openrouter` (language), `platform-cohere` (embedding), then `platform-bedrock` (both, zero retention) |

A workspace with zero retention (`Tenant.aiZeroRetention`) sees only zero-retention entries: its own Bedrock role,
an Anthropic key whose owner attested to zero retention, or `platform-bedrock`. Anything else is inert, and with
nothing left the call is `ZeroRetentionUnavailable` (400).

## Rules

### The resolver and the catalog

- The resolver is the only way to get a model: `AiRouteResolver.resolve(tenantId, need)` builds the single-payer pool
  and fails closed with a typed error: `AiNotConfigured` (503, nothing serves the need), `ZeroRetentionUnavailable`
  (400), `AiCredentialFailing` (503), and, from `languageModel(alias)`, `AiModelNotOnRoute` (503, no id for that alias
  on that route) and `ZeroRetentionUnavailable` (a zero-retention workspace asking for an alias `MODEL_CATALOG` does
  not mark `zdrCapable`). Never catch one to try another provider. `resolvePlatform(need)` is only for platform-owned content
  with no tenant (the global knowledge base). [guard: ai-route-resolver.service.spec.ts,
  ai-route-resolver.payer-boundary.spec.ts]
- Provider packages (`@ai-sdk/<provider>`, `@openrouter/*`, `openai`) and `createGateway` are imported only under
  `apps/backend/src/domains/ai/routing/` (the route registry builds every client) and `domains/ai/moderation/`. The
  `ai` package (`generateText`, `embed`) is fine anywhere: it calls the model it is handed.
  [guard: ai-provider-clients.spec.ts]
- Code names an alias, never a model id. Ids live only in `MODEL_CATALOG`: one row per alias, one column per route
  family (`anthropicId`, `openrouterId`, `bedrockId`), all on the Claude 5.5 family. An id that cannot be confirmed on
  a route is left unset and the alias listed in `UNREGISTERED_ALIASES`, so that route refuses it; an older model is
  never substituted. A model bump is the catalog plus its pricing rows
  (`packages/appshore/db/prisma/seeds/08-model-pricing.seed.ts`), never an env var.
  [guard: model-id-literals.spec.ts, model-catalog.spec.ts]
- The resolver tunes each model per route: the alias's effort in the route family's shape, and one retry of a refused
  call on the next alias up, on the same route (`tunedLanguageModel`). [guard: model-tuning.middleware.spec.ts]
- Routing reads its keys through `ConfigService`, never `process.env`. [guard: ai-routing-config.spec.ts]
- Every model call names an output ceiling from `OUTPUT_CEILINGS`. Thinking is billed as output, so no ceiling is
  below `MIN_OUTPUT_CEILING` (1,024). [guard: model-calls-name-a-ceiling.spec.ts, output-ceilings.spec.ts]
- Prompt caching is the route's: each registry entry declares `promptCache` and the resolver wraps its language models
  (`withPromptCache`). `cacheControl` is written nowhere else. [guard: prompt-cache.spec.ts, ai-call-paths.spec.ts]

### Cost

- Every model result's usage is read through `usageFromAiSdk`: it reads cache reads and writes on each provider's
  shape and sums a multi-step run. Nothing else reads `inputTokens` or `outputTokens` (bar the embedding service, whose
  results have their own shape). [guard: usage-from-ai-sdk.spec.ts, ai-call-paths.spec.ts]
- A ledger row records the route that served it (`routeId`, `credentialType`) and the model on that route's own column
  (`ledgerModelIdFor`), which has a pricing row. [guard: model-catalog.spec.ts]
- The AI budget counts platform-paid spend only. The platform paid when `credentialType` is null or starts with
  `PLATFORM_`; the one statement is `PLATFORM_PAID_SQL` / `payerOf` in `telemetry/platform-paid.ts`.
  [guard: ai-budget-payer.integration.spec.ts]
- Check the cap only when the platform pays, after resolving and before the call:
  `if (route.payer === 'PLATFORM') await this.aiTelemetry.assertBudget(tenantId)`. A workspace on its own key is never
  capped. [guard: ai-call-paths.spec.ts, ai-budget-payer.integration.spec.ts]
- A provider credit refusal is a budget error: in a model call's catch, `throw mapProviderRefusal(err, tenantId,
route)`. On a workspace key it is also recorded on the credential (`reportCreditRefusal`), which stays ACTIVE.
  [guard: ai-provider-credit-refused.error.spec.ts]
- Budgets come from the plan: `AiBudgetSeederService` writes a workspace's caps from `PLAN_AI_BUDGETS` and owns a row
  only while its `notes` carry the `plan:` stamp; a row an admin edited is never reseeded.
  [guard: ai-budget-seeder.service.spec.ts]
- With sub-keys on (`OPENROUTER_PROVISIONING_KEY` and `AI_CREDENTIALS_KEY`), each workspace calls
  `platform-openrouter` with its own OpenRouter key, capped at its monthly hard budget; same route id, still
  platform-paid. A sub-key that cannot be read falls back to the master key and never fails a resolve.
  [guard: ai-route-resolver.subkey.spec.ts]
- Code that writes `TenantAiBudget.monthlyHardUsd` calls `OpenRouterProvisioningService.syncLimit(tenantId, cap)`
  after the write, not awaited (the seeder and the admin AI spend service do). [review-only: no spec finds every writer]

### Workspace credentials (bring your own key)

The credential types a workspace can connect, from `TENANT_CREDENTIAL_CAPABILITIES` in
`apps/backend/src/domains/ai/routing/route-registry.ts`. Each is the workspace's own account, so the workspace pays
its provider and no platform cap applies:

| `AiCredentialType`   | Serves              | Retention                                                     | Connected by                                                                      |
| -------------------- | ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ANTHROPIC_KEY`      | language            | zero retention if the owner attests it per key, else standard | pasting a key (`POST /ai-settings/credentials`)                                   |
| `OPENROUTER_KEY`     | language            | standard, always                                              | pasting a key                                                                     |
| `VERCEL_GATEWAY_KEY` | language            | standard, always (the gateway is pinned to Anthropic)         | pasting a key                                                                     |
| `BEDROCK_ROLE`       | language, embedding | zero retention                                                | the role flow (`credentials/bedrock/begin`, then `complete`); no secret is stored |

An `OPENROUTER_KEY` credential is OpenRouter on the workspace's own key: pool TENANT, paid by the workspace, its
ledger rows carry `credentialType` `OPENROUTER_KEY`. That is not the platform sub-key above, which is also an
OpenRouter key per workspace but is provisioned by the platform under its master key, stays on the
`platform-openrouter` route, is paid by the platform and is capped at the workspace's budget.
[guard: route-registry.parity.spec.ts, ai-route-resolver.payer-boundary.spec.ts]

- Whether bring-your-own-key is on is `CredentialCryptoService.isConfigured()` (the `AI_CREDENTIALS_KEY` switch);
  there is no other flag and no fallback key. Off, the connect routes answer 404. [guard: credential-crypto.service.spec.ts,
  ai-credential-connect.service.spec.ts]
- A secret is never read back. A pasted key is tested first and stored only if the test passes, as the
  `CredentialCryptoService` envelope (AES-256-GCM, bound to the tenant and the credential's public id). It leaves the
  API only as `lastFour`, through `toAiCredentialSummary`; provider error text passes through `redactSecret`; events
  carry the public id and type only. [guard: ai-credential.serializer.spec.ts, redact-secret.spec.ts,
  ai-credential-connect.service.spec.ts]
- A failing workspace key is never served on the platform key: a pool is the workspace's credentials or the platform's
  routes, never both. A credential the retention policy rules out is inert, never deleted.
  [guard: ai-route-resolver.payer-boundary.spec.ts]
- A credential is stored ACTIVE only after its test passes; after that, status moves only through `validate` (the
  owner's "Test again" and the daily re-validation job): ACTIVE to FAILING on a failed test, FAILING to ACTIVE on a
  passing one. [guard: ai-credential-connect.service.spec.ts]
- A workspace AWS role is assumed with the backend's own ambient credentials (the task role the workspace's trust
  policy names), never through another role. The external id is recomputed on the server (`bedrockExternalId`), and a
  role is stored only after the two-direction check passes. [guard: bedrock-ambient-credentials.spec.ts,
  ai-credential-connect.service.spec.ts]
- A new credential type is an `AiCredentialType` value plus a `TENANT_CREDENTIAL_CAPABILITIES` entry: what it serves,
  its retention, its prompt cache, and a builder that reaches the provider only through the catalog. A pasted type is
  also in `PASTE_KEY_TYPES`, which is what the probe tests. [guard: route-registry.parity.spec.ts]

## Recipe: make a model call through the resolver

Condensed from `apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts` (`extract`): resolve,
cap only platform money, take the alias's model, map a credit refusal. A new feature calls `extract`, which does all
of this and writes the ledger row; write these steps by hand only inside a new sanctioned path.

```typescript
// apps/backend/src/domains/ai/infrastructure/providers/structured-output.service.ts, extract (condensed)
const route = await this.aiRouteResolver.resolve(options.aiContext.tenantId, 'language');
if (options.enforceBudget && route.payer === 'PLATFORM') {
  await this.aiTelemetry.assertBudget(options.aiContext.tenantId);
}
const model = route.languageModel(options.modelAlias);
try {
  const result = await generateText({ model, system, messages, output, maxOutputTokens: options.maxOutputTokens });
  usagePayload = usageFromAiSdk(result);
  // ... record the ledger row with route.routeId, route.credentialType, route.ledgerModelIdFor(alias, answeredBy)
} catch (caught) {
  throw mapProviderRefusal(caught, options.aiContext.tenantId, route);
}
```

## Recipe: add a platform route

A route the operator turns on with a key, for every workspace that has no key of its own. Say the route is
`platform-mistral`:

1. `route-registry.ts`: a `PLATFORM_CREDENTIAL_TYPES` entry (`PLATFORM_MISTRAL`, so the ledger counts it as
   platform-paid), the route id in `PlatformRoute['routeId']`, and a `PLATFORM_ROUTES` entry: `serves`, `retention`,
   `promptCache`, `isConfigured` (its key is set) and `buildProvider`. Order is preference within a need; the
   zero-retention route stays last.
2. Its key: a `PlatformRouteConfig` field (`mistralApiKey`), read in the resolver's `platformConfig()`, declared in the
   zod schema in `apps/backend/src/config/configuration.ts` and in `apps/backend/.env.example`.
3. Its model ids: a column in `ModelCatalogEntry` and `ROUTE_ID_COLUMNS`, an id per alias (or the alias in
   `UNREGISTERED_ALIASES`), and pricing rows in `08-model-pricing.seed.ts`.
4. The specs that pin the registry: `route-registry.parity.spec.ts` (the exact prompt-cache map, the order) and
   `model-catalog.spec.ts` (a pricing row for every id a route can record).

A new workspace credential type follows the last rule of the credentials section instead, plus its probe in
`apps/backend/src/domains/ai/routing/connect/ai-credential-probe.service.ts`.

## What a tenant key changes

When a workspace owner connects a key (`POST /ai-settings/credentials`, owner only), from the next call:

- Its pool is TENANT for every need that key serves: the workspace pays its provider, the platform cap no longer
  applies, and the ledger row's `credentialType` is the key's type, so the spend is not counted against the budget.
- A need the key does not serve (embeddings, for a language key) stays on the platform pool.
- If the key starts failing, those needs are refused with `AiCredentialFailing` until the owner fixes or removes it.
  Removing it (`DELETE /ai-settings/credentials/:credential_id`) moves the need back to the platform; nothing falls
  back on its own. The API has no route that disables a credential: `DISABLED` is set only outside it.
- The settings page shows who pays per need (`describePayers`): `platform`, the credential's public id, or `none`.

## Flag in review

- A model id outside the catalog, or an env var that holds one.
- A provider client built outside `domains/ai/routing/`.
- A caught `AiNotConfigured` or `AiCredentialFailing` followed by a call on another route.
- A model call with no output ceiling; usage read by hand.
- A budget check on a workspace-paid route, or none on a platform-paid one.
- A credential secret in a response, a log line or an event.
- A write to `monthlyHardUsd` with no `syncLimit` after it.
