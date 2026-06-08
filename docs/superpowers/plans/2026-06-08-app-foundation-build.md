# app-foundation Golden Starter — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking. This is a **clone-and-strip** build, not from-scratch — fidelity to Sally's structure is preserved by construction. "Tests" here are **verification gates** (type-check, build, boot, grep) run after each surgical phase.

**Goal:** Produce `~/code/app-foundation` — a domain-free clone of Sally's full platform (NestJS+Prisma+Postgres backend, Next.js 15 web, AI chat + empty MCP, Desk+Voice gutted, Stripe/Inngest/BullMQ/Firebase/S3/email/SMS/push/Langfuse, terraform IaC), multi-tenant by default and single-tenant via `MULTI_TENANT=false`, pushed to GitHub as a template repo.

**Architecture:** Copy Sally's tree → drop secrets/artifacts/migrations/domain-trees → rename `@sally/*`→`@app/*` and branding → prune Prisma to ~35 platform models with one fresh migration → genericize backend enum/constant catalogs + empty AI/MCP/Desk/integrations registries → add `MULTI_TENANT` tenancy toggle → genericize web → regenerate derived artifacts → verify both tenancy modes boot and AI chat streams → push.

**Tech Stack:** pnpm 9 + Turbo, NestJS 11, Prisma 7 + Postgres (pgvector), Next.js 15 App Router, Zod v3, Mastra + AI SDK + Anthropic, Inngest, BullMQ/Redis, Stripe, Firebase, LiveKit, OTel+Langfuse+pino, Terraform.

**Source maps:** `docs/superpowers/specs/2026-06-08-app-foundation-golden-starter-design.md` (spec) and `2026-06-08-seam-report.md` (file-level inventory). The seam report's KEEP/GENERICIZE/STRIP tables are authoritative for every file decision.

---

## Conventions for the executor

- **Working dir:** `~/code/app-foundation` (already exists with the spec/plan committed; git initialized).
- **Source:** `~/sally` is READ-ONLY reference. Never modify it.
- **Verification gate** after each phase = run the phase's listed checks; do not advance until they pass. If a check fails, fix within the phase.
- **Commit** at the end of each phase with the given message.
- **`@app` scope, neutral naming** everywhere. After the rename phase, `grep -ri sally <path>` in touched areas should trend to zero (intentional residuals noted per phase).
- **Secrets are a hard gate** — the files listed in Phase 1 must never be copied.

---

## Phase 0: Pre-flight & scaffold the tree

**Files:** new repo working tree at `~/code/app-foundation`.

- [ ] **Step 1: Confirm clean target.** The repo already holds `docs/` + `.git`. Verify nothing else is staged.

Run: `cd ~/code/app-foundation && git status --short && ls -A`
Expected: only `.git` and `docs` present.

- [ ] **Step 2: Copy Sally's tree, excluding heavy/secret/artifact paths.** Use rsync with explicit excludes.

```bash
cd ~/sally
rsync -a --info=progress2 \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' --exclude='.turbo' --exclude='dist' --exclude='coverage' \
  --exclude='.vercel' --exclude='.worktrees' --exclude='.superpowers' \
  --exclude='.playwright-mcp' --exclude='.screenshots' --exclude='.docs' \
  --exclude='.jira' --exclude='.env-archive' --exclude='__dev-util' \
  --exclude='Obsidian Vault' --exclude='postman' --exclude='.claude' \
  --exclude='pnpm-lock.yaml' \
  --exclude='*.log' --exclude='.DS_Store' \
  --exclude='apps/backend/prisma/migrations' \
  --exclude='apps/backend/node_modules' --exclude='apps/web/node_modules' \
  --exclude='packages/screenshots' \
  --exclude='**/.env' --exclude='**/.env.*' \
  --exclude='firebase-debug.log' --exclude='firebase-admin-sdk.json' \
  --exclude='apps/backend/firebase-admin-sdk.json' \
  --exclude='infra/bootstrap/terraform.tfstate*' \
  --exclude='infra/bootstrap/.terraform' \
  --exclude='tools/docs' --exclude='tools/staging' --exclude='tools/prompts' \
  --exclude='scripts/trip-verify' \
  ./ ~/code/app-foundation/
```

- [ ] **Step 3: Remove leftover Sally-only root files that shouldn't ship.**

```bash
cd ~/code/app-foundation
rm -f desk-prompt.txt SECOND_BRAIN.md mkdocs.yml docker-compose.osrm.yml docker-compose.stg-debug.yml captain-definition firebase-debug.log
rm -rf docs/.docs 2>/dev/null || true
```

- [ ] **Step 4: SECRET HARD-GATE — verify no secrets came through.**

Run:
```bash
cd ~/code/app-foundation
echo "--- env files (expect only .env.example) ---"; find . -name '.env*' -not -name '.env.example' | grep -v node_modules
echo "--- firebase sdk (expect none) ---"; find . -name 'firebase-admin-sdk.json'
echo "--- tfstate (expect none) ---"; find . -name '*.tfstate*'
echo "--- cred docs (expect none) ---"; find . -path '*tools/docs*'
```
Expected: each section empty (only `.env.example` files may appear).

- [ ] **Step 5: Verify domain-free copy of structure exists and migrations are gone.**

Run: `cd ~/code/app-foundation && ls apps/backend/prisma/ && echo "---" && ls apps/ packages/ infra/`
Expected: `prisma/` has `schema.prisma`, `seeds/`, `seed.ts` but NO `migrations/`. `apps/` has backend, web (console/deck/studio also copied — handled Phase 7).

- [ ] **Step 6: Commit the raw scaffold.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "chore: scaffold from Sally tree (secrets/artifacts/migrations excluded)"
```

**Gate:** Step 4 shows zero secrets; Step 5 shows no migrations dir.

---

## Phase 1: Delete domain trees (backend + web + shared-types + tools)

**Files:** whole-directory deletions per the STRIP inventory (seam report §5).

- [ ] **Step 1: Delete backend domain trees.**

```bash
cd ~/code/app-foundation/apps/backend/src/domains
rm -rf fleet routing financials analytics home
rm -rf platform-services
# operations: keep notifications/ + support/, delete the rest
cd operations && rm -rf command-center monitoring alerts ifta shield horizon && cd ..
# platform: drop trucking sub-trees
cd platform && rm -rf reference-data add-ons && cd ..
# integrations: keep framework (credentials, oauth, adapters, dto, services shell), drop vendors
cd integrations && rm -rf accounting edi load-board sync && cd ..
# ai: drop document-intelligence (voice kept gutted per decision)
cd ai && rm -rf document-intelligence && cd ..
```

- [ ] **Step 2: Re-home operations/notifications + operations/support to top-level domains.**

```bash
cd ~/code/app-foundation/apps/backend/src/domains
git mv operations/notifications notifications 2>/dev/null || mv operations/notifications notifications
git mv operations/support support 2>/dev/null || mv operations/support support
rm -rf operations
```

- [ ] **Step 3: Delete backend infrastructure domain pieces.**

```bash
cd ~/code/app-foundation/apps/backend/src/infrastructure
rm -rf webhooks mock
rm -f sync/vendor-data.processor.ts sync/telemetry.processor.ts
rm -f events/payloads/load-event-payloads.ts events/payloads/fleet-event-payloads.ts \
      events/payloads/trailer-event-payloads.ts events/payloads/trip-event-payloads.ts \
      events/payloads/financial-event-payloads.ts events/payloads/document-event-payloads.ts \
      events/payloads/operations-event-payloads.ts events/payloads/integration-event-payloads.ts 2>/dev/null || true
```

- [ ] **Step 4: Delete domain test factories + the domain-coupled architecture spec.**

```bash
cd ~/code/app-foundation/apps/backend/src
cd test/factories && rm -f driver.factory.ts vehicle.factory.ts trailer.factory.ts load.factory.ts \
  route-plan.factory.ts stop.factory.ts customer.factory.ts invoice.factory.ts payment.factory.ts \
  settlement.factory.ts alert.factory.ts document.factory.ts 2>/dev/null || true; cd ../..
rm -f architecture/status-endpoints-validation.spec.ts
```

- [ ] **Step 5: Delete web domain features + routes.**

```bash
cd ~/code/app-foundation/apps/web/src/features
rm -rf fleet routing operations driver financials desk horizon edi email-intake fuel-cards \
       integrations analytics customer home system-activity login-activity feedback support \
       admin-events add-ons
# platform sub-features: drop trucking ones
cd platform && rm -rf reference-data broadcasts cache-management && cd ..
cd ~/code/app-foundation/apps/web/src/app
rm -rf "(super-admin)" admin agent-actions customer dispatcher driver legal pricing product \
       rest-optimizer sally-canvas sally-labs setup-hub track onboarding
rm -f page.tsx
```

- [ ] **Step 6: Delete domain shared-types + screenshots + domain tools/tests.**

```bash
cd ~/code/app-foundation/packages/shared-types/src
rm -rf fleet financials routing operations desk integrations api enums
rm -f ifta.ts
rm -f platform/fuel-cards.schema.ts platform/lead.schema.ts platform/home.schema.ts \
      platform/reference-data.schema.ts platform/platform-services.schema.ts
rm -f generated/prisma-enums.ts  # regenerated in Phase 6
cd ~/code/app-foundation
rm -rf tests/api tests/browser tests/evals tests/fixtures 2>/dev/null || true
rm -f tools/stripe/sync-products.sh tools/db/pull-staging.sh tools/dev/setup-osrm.sh 2>/dev/null || true
rm -f scripts/export-scope-vocab.ts 2>/dev/null || true
```

- [ ] **Step 7: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "chore: strip Sally domain trees (fleet/routing/financials/operations/analytics/home + domain features/routes/types)"
```

**Gate:** `ls apps/backend/src/domains` shows only `{platform, billing, integrations, notifications, support, admin, ai, desk, prompting}`. `ls apps/web/src/features` has no fleet/routing/etc. No deletions left dangling references yet (compile errors expected until later phases — that's fine; gate here is structural only).

---

## Phase 2: Rename `@sally/*` → `@app/*` + branding (scripted)

**Files:** all `package.json`, all TS/TSX imports, configs, CI, docker, terraform.

- [ ] **Step 1: Rename the package scope everywhere.**

```bash
cd ~/code/app-foundation
grep -rl '@sally/' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.mjs' --include='*.js' --include='*.yml' --include='*.yaml' . | grep -v node_modules | \
  xargs sed -i '' 's#@sally/#@app/#g'
```

- [ ] **Step 2: Rename event/cache/service identifiers + branding tokens.**

```bash
cd ~/code/app-foundation
# code identifiers
grep -rl 'SALLY_EVENTS\|SallyEventName' --include='*.ts' . | grep -v node_modules | xargs sed -i '' 's/SALLY_EVENTS/DOMAIN_EVENTS/g; s/SallyEventName/DomainEventName/g'
grep -rl 'SallyCacheService' --include='*.ts' . | grep -v node_modules | xargs sed -i '' 's/SallyCacheService/AppCacheService/g'
grep -rl 'SallyInsight' --include='*.ts' --include='*.tsx' . | grep -v node_modules | xargs sed -i '' 's/SallyInsight/AppInsight/g'
grep -rl 'SallyGlobalProvider' --include='*.tsx' --include='*.ts' . | grep -v node_modules | xargs sed -i '' 's/SallyGlobalProvider/AppAIProvider/g'
# cookies / storage keys
grep -rl 'sally-auth\|sally-role\|sally:font-size-scale\|SALLY_' --include='*.ts' --include='*.tsx' . | grep -v node_modules | xargs sed -i '' 's/sally-auth/app-auth/g; s/sally-role/app-role/g; s/sally:font-size-scale/app:font-size-scale/g; s/SALLY_/APP_/g'
```

- [ ] **Step 2b: Rename `sally-cache.service.ts` file + `sally-ai` folders.**

```bash
cd ~/code/app-foundation/apps/backend/src/infrastructure/cache
[ -f sally-cache.service.ts ] && (git mv sally-cache.service.ts app-cache.service.ts 2>/dev/null || mv sally-cache.service.ts app-cache.service.ts)
cd ~/code/app-foundation/apps/backend/src/domains/ai
[ -d sally-ai ] && (git mv sally-ai assistant 2>/dev/null || mv sally-ai assistant)
cd ~/code/app-foundation/apps/web/src/features/platform
[ -d sally-ai ] && (git mv sally-ai ai-chat 2>/dev/null || mv sally-ai ai-chat)
# fix imports to the renamed paths
cd ~/code/app-foundation
grep -rl "infrastructure/cache/sally-cache\|domains/ai/sally-ai\|platform/sally-ai\|sally-ai.service\|sally-ai.controller\|sally-ai.module" --include='*.ts' --include='*.tsx' . | grep -v node_modules | \
  xargs sed -i '' 's#sally-cache.service#app-cache.service#g; s#domains/ai/sally-ai#domains/ai/assistant#g; s#platform/sally-ai#platform/ai-chat#g'
# rename the file basenames inside assistant/ that are sally-ai.*
cd ~/code/app-foundation/apps/backend/src/domains/ai/assistant 2>/dev/null && for f in sally-ai.*; do [ -e "$f" ] && mv "$f" "${f/sally-ai/assistant}"; done; cd ~/code/app-foundation
grep -rl 'assistant/sally-ai\|sally-ai\.' --include='*.ts' apps/backend/src/domains/ai 2>/dev/null | xargs sed -i '' 's#sally-ai\.#assistant.#g' 2>/dev/null || true
```

- [ ] **Step 3: Rename in root package.json + descriptions.**

```bash
cd ~/code/app-foundation
sed -i '' 's/"name": "sally"/"name": "app-foundation"/; s/SALLY - Rest Optimization System for truck drivers/app-foundation — domain-free platform starter/' package.json
sed -i '' 's/@sally\/backend/@app\/backend/g; s/@sally\/web/@app\/web/g; s/@sally\/console/@app\/console/g; s/@sally\/qa/@app\/qa/g' package.json
```

- [ ] **Step 4: Verify scope rename is complete.**

Run: `cd ~/code/app-foundation && grep -rn '@sally/' --include='*.ts' --include='*.tsx' --include='*.json' . | grep -v node_modules | head`
Expected: no output (empty).

- [ ] **Step 5: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "refactor: rename @sally/* -> @app/* and neutralize branding identifiers/cookies"
```

**Gate:** Step 4 empty. (Deeper branding strings in copy/Swagger/metadata handled in Phases 4 & 7.)

---

## Phase 3: Prune Prisma schema + fresh migration + slim seeds

**Files:** `apps/backend/prisma/schema.prisma`, `prisma/seeds/*`, new `prisma/migrations/0_init/`.

> This is the riskiest phase — the 5634-line schema has ~95 models, many domain. Strategy: a dedicated agent prunes the schema to the ~35 platform models in the seam report §8, severs all domain relations/fields/enums, then `prisma validate` and a fresh migration prove correctness.

- [ ] **Step 1: Prune schema to platform models.** Dispatch a focused agent to edit `schema.prisma`: keep exactly the models listed in seam report §8 "Kept models/enums"; delete every domain model in §8 "deleted" + their enums; on `Tenant`/`User`/`Conversation`/`ConversationMessage`/`UserInvitation`/`Document` remove the listed domain fields & relation arrays; genericize `UserRole` (→ `OWNER, ADMIN, MEMBER, SUPER_ADMIN`), `NotificationType`, `AiSurface`, `IntegrationType`, `IntegrationVendor`; preserve `Unsupported("vector(1536)")` + tsvector columns + the dual-ID convention.

- [ ] **Step 2: Validate schema.**

Run: `cd ~/code/app-foundation/apps/backend && npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 3: Slim seeds — keep platform, drop domain.**

```bash
cd ~/code/app-foundation/apps/backend/prisma/seeds
rm -f 03-truck-stops.seed.ts 06-reference-data.seed.ts 09-migrate-existing-tenants.seed.ts 11-fuel-card-types.seed.ts ifta-tax-rates.ts
```
Then edit `index.ts` to drop the removed seeds from the run order, and genericize `01-super-admin.seed.ts` (email `admin@sally.com` → `admin@example.com`), `07-plan-config` + `08-plan-entitlements` (neutral tier names, `unitLabel` default `seat/month`), `02-feature-flags` (generic flag rows only), `10-vendor-configs` (trim), `12-add-ons` (generic), `13-desk` (gut), `14-model-pricing` (keep).

- [ ] **Step 4: Generate the fresh init migration + raw-SQL extras.** Start a throwaway Postgres, then:

```bash
cd ~/code/app-foundation && docker compose up -d postgres && sleep 6
cd apps/backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app?schema=public" npx prisma migrate dev --name init --create-only
```
Then prepend to the generated migration SQL: `CREATE EXTENSION IF NOT EXISTS vector;` and add the GIN/ivfflat index DDL for `KnowledgeDocument.embedding` + `content_tsv` (and DeskMemory embedding) per seam report §8.

- [ ] **Step 5: Apply migration + generate client.**

Run: `cd ~/code/app-foundation/apps/backend && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app?schema=public" npx prisma migrate deploy && npx prisma generate`
Expected: migration applied; client generated with no errors.

- [ ] **Step 6: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "feat(db): prune Prisma to ~35 platform models, fresh 0_init migration, slim seeds"
```

**Gate:** `prisma validate` passes; `prisma migrate deploy` applies cleanly on a fresh DB; `prisma generate` succeeds.

---

## Phase 4: Backend genericize (catalogs, joins, empty AI/MCP/Desk registries)

**Files:** per seam report §4 KEEP-BUT-GENERICIZE backend tables + §6/§7 (AI/MCP).

> Parallelizable across independent file groups. Each sub-task ends with the file group type-checking against the new Prisma client.

- [ ] **Step 1: Bootstrap & auth genericize.** Edit `main.ts` (Swagger title/tags → neutral; remove `setNestAppContext` desk import → make a pluggable hook; `OAUTH_ISSUER` default → env), `app.module.ts` (remove every deleted domain module + domain queue dispatcher import; KEEP the `APP_GUARD` chain, RequestContextMiddleware, pino, entitlements, notifications/bulk-ops dispatchers), `config/configuration.ts` (strip osrm/here/weather/gasbuddy/pcmiler/routing/ratecon keys; rename `projectName`; **add `multiTenancy.enabled` + `implicitTenantId`** — used in Phase 5), `auth/auth.service.ts` + `auth.controller.ts` + `strategies/jwt.strategy.ts` + `refresh-jwt.strategy.ts` (strip `{driver,customer}` includes + returned driver/customer fields, keep `tenant`), `auth/guards/plan.guard.ts` (neutral tier names), `dev/*` (remove desk-bootstrap, trim ROLE_ORDER to OWNER/ADMIN/MEMBER/SUPER_ADMIN), `constants/cache.constants.ts` (strip domain namespaces).

- [ ] **Step 2: Infrastructure genericize.** Edit per §4: `cache/cache-invalidation.subscriber.ts` (replace domain event→namespace switch with a small generic map), `sse/domain-event-sse-bridge.service.ts` + `sse-events.constants.ts` (regenerate `DOMAIN_TO_SSE` to generic events), `events/sally-events.constants.ts` (renamed → derive from registry; strip the domain `EVENT_REGISTRY` array, keep the `EventDefinition` interface + helpers), `events/event-registry.ts` (split: keep interface/helpers, empty/generic the array), `queue/queue.constants.ts` + `queue.module.ts` + `job.types.ts` (generic queue set: events, notifications, webhooks, bulk-ops, ai-interactive, ai-background; keep `bullJobIdFromDbId`), `sync/integration-job-router.ts` + `sync-job.types.ts` (strip ELD/TMS tables), `notification/notification.service.ts` + `email.service.ts` (drop tenant-registration bespoke methods/templates), `storage/file-storage.service.ts` (bucket → env; remove ratecon key helper), `shared/base/base-tenant.controller.ts` (remove driver-scope asserts), `shared/guards/external-source.guard.ts` (parameterize resource lookup), `shared/constants/scheduling.constants.ts` (generic job keys).

- [ ] **Step 3: Empty the AI/MCP/Desk/agents/prompting registries (the extension points).** Per §6/§7: `ai/mcp/mcp-tools.module.ts` → empty `imports[]`/`providers[]`, keep one `HealthTool` (re-scope `platform:read`) + comment; `ai/mcp/mcp-tool.service.ts` → empty `WRITE_TOOLS`, drop persona import; `ai/ai.module.ts` → drop DocumentIntelligence (keep Voice gutted); `assistant/*` (renamed) → strip persona greetings/moderation domain copy, keep stream skeleton + HITL; `mastra/mastra.provider.ts` → ONE generic `assistant` agent; `agents/*` → keep `AbstractBaseAgent`, neutral `AGENT_IDS`/`UserMode`, registry→one agent; `orchestrator/*` → default to single generic agent; `agent-contract/scope-registry.constants.ts` + `role-scopes.ts` → generic scopes (`platform:*`, `comms:*`, `documents:*`, `integrations:*`), neutral roles; `prompting/*` → one generic assistant fallback, neutral `PROMPT_NAMES`, generic persona config with empty `allowedTools`; `knowledge-base/content/content-loader.ts` → repoint to empty content dirs; `desk/responsibilities/index.ts` + modules → empty `RESPONSIBILITY_REGISTRY`; `desk/core/inngest/inngest.controller.ts` → reduce hardcoded responsibility/scheduler arrays to empty. Delete the domain payload files in §5 (12 `*.agent.ts` except base, persona base-prompts, skills/domain, fallbacks, desk responsibility folders, etc.).

- [ ] **Step 4: Genericize integrations framework.** `integrations/integrations.{controller,service}.ts`, `vendor-registry` types, `adapter-factory.service.ts`, `adapters.module.ts` → empty `VENDOR_REGISTRY`, remove deleted vendor module imports; keep `credentials/` (AES-256) + `oauth/` unchanged; re-home/keep `email-intake` receiver but strip Loads/DocIntelligence routing (or delete email-intake if it only fed domain — prefer delete to reduce surface).

- [ ] **Step 5: Backend type-check gate.**

Run: `cd ~/code/app-foundation/apps/backend && pnpm install >/dev/null 2>&1; npx tsc --noEmit -p tsconfig.json`
Expected: zero errors. (Iterate: most errors will be dangling imports of deleted files — remove the import/usage. Re-run until clean.)

- [ ] **Step 6: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "refactor(backend): genericize catalogs/joins; empty MCP/Desk/agent/integration registries"
```

**Gate:** `tsc --noEmit` on backend passes with zero errors.

---

## Phase 5: Tenancy config toggle (backend + frontend)

**Files:** auth guard/strategy, config, a bootstrap tenant-seed; web middleware/url/login/store.

- [ ] **Step 1: Backend short-circuit.** In `auth/guards/tenant.guard.ts`: if `config.multiTenancy.enabled === false`, set `request.tenantId = config.implicitTenantId` and return `true` (never throw on missing tenant). In `auth/strategies/jwt.strategy.ts`: when disabled, skip requiring/loading the tenant relation and stamp implicit tenant onto `request.user.tenantId/tenantDbId`. In `plan.guard.ts`: when disabled, treat implicit tenant as top tier.

- [ ] **Step 2: Implicit-tenant bootstrap seed.** Add a seed/bootstrap step that, when `MULTI_TENANT=false`, ensures exactly one `Tenant` row (id from `IMPLICIT_TENANT_ID`, default 1) + a default admin exists. Wire into `prisma/seeds/index.ts` guarded by the env flag.

- [ ] **Step 3: Frontend toggle.** Add `isMultiTenant()` reading `NEXT_PUBLIC_MULTI_TENANT` in `shared/lib/tenant-url.ts`; short-circuit `extractSubdomain()`→null, `buildTenantUrl/RedirectUrl`→path/null, `getCookieDomain()`→undefined. In `middleware.ts`: gate subdomain extraction + `x-tenant-slug` + subdomain-redirect behind the flag. In `login/page.tsx` + `features/auth/components/login-form.tsx`: gate `/tenants/branding/${slug}` fetch + cross-subdomain relay behind the flag; neutral default branding. In `features/auth/store.ts`: gate `getCookieDomain()` subdomain logic; renamed cookies (already done Phase 2).

- [ ] **Step 4: Gate registration/onboarding routes behind MT.** In web routing (`register`/`registration`/`accept-invitation` were deleted in Phase 1 for `register`/etc. — KEEP `accept-invitation` and onboarding for MT; re-add a guard so they render only when `isMultiTenant()`). Backend: the tenant-creation endpoint stays but is unreachable in ST because no registration UI calls it; optionally guard it with a config check returning 404 when MT off.

- [ ] **Step 5: Env examples.** Update `apps/backend/.env.example` (+ `MULTI_TENANT=true`, `IMPLICIT_TENANT_ID=1`) and `apps/web/.env.example` (+ `NEXT_PUBLIC_MULTI_TENANT=true`).

- [ ] **Step 6: Type-check gate (backend + web).**

Run: `cd ~/code/app-foundation && (cd apps/backend && npx tsc --noEmit) && (cd apps/web && pnpm install >/dev/null 2>&1; npx tsc --noEmit)`
Expected: zero errors both.

- [ ] **Step 7: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "feat: MULTI_TENANT config toggle (backend guard short-circuit + implicit tenant + frontend isMultiTenant)"
```

**Gate:** both type-checks pass.

---

## Phase 6: Web genericize + regenerate derived artifacts

**Files:** web layout/metadata/nav/realtime/command-palette + shared-types regen + arch tests.

- [ ] **Step 1: Web shell genericize.** Per §4 web table: `app/layout.tsx` + `layout-client.tsx` (neutral metadata/title/description/openGraph/manifest; remove driver-layout branch), `next.config.ts` (rename CSP origins, drop domain redirect), `tailwind.config.ts` (rename UI preset import; optionally drop `hos-*`/`route-draw` keyframes), `public/site.webmanifest` (neutral name/icons), `shared/components/layout/**` (remove `/dispatcher` nav + driver shells; rebuild `navigation.ts` with generic items: Home, AI, Settings, Admin), `shared/components/command-palette/**` (generic providers/registry), `shared/realtime/invalidation-map.ts` (replace domain events with a small generic map), `shared/constants/{query-keys,storage-keys}.ts` (generic namespaces), delete `shared/components/common/{dashboard,landing}/**`.

- [ ] **Step 2: AI chat UI genericize.** `features/platform/ai-chat/**` (renamed): keep streaming chat (`fetch` + SSE parse) + `RichCardRenderer` as pluggable registry; empty the card catalog (`engine/types.ts` + `components/cards/*`); neutral copy; mount via renamed `AppAIProvider`.

- [ ] **Step 3: Sidebar nav — three generic items.** Ensure `navigation.ts` yields a sidebar with **AI Assistant**, **Settings**, **Admin** (matching the "two/three sidebar nav" ask) plus a Home/Dashboard placeholder page at `app/(app)/page.tsx` or equivalent, so the shell renders something on login.

- [ ] **Step 4: Regenerate shared-types enums + carve generic subset.**

Run: `cd ~/code/app-foundation/apps/backend && npx tsx scripts/generate-shared-enums.ts`
Then ensure `packages/shared-types/src/index.ts` barrel only re-exports kept folders (platform subset, constants, utils, infrastructure, ai). Fix the 6 web files importing shared-types to the carved subset.

- [ ] **Step 5: Regenerate/genericize architecture fitness tests + qa.** Update `architecture/*.spec.ts` that referenced domain enums (status-call-sites, web-status-casing, no-duplicate-zod-enums) to the generic enum set; regenerate `tests/rbac/rbac-matrix.generated.ts` content for generic roles; keep smoke + security-headers tests.

- [ ] **Step 6: Full monorepo type-check + lint + build gate.**

Run: `cd ~/code/app-foundation && pnpm install && pnpm type-check && pnpm lint && pnpm build`
Expected: all succeed. (Iterate per error until green.)

- [ ] **Step 7: grep-for-sally sweep.**

Run: `cd ~/code/app-foundation && grep -rin 'sally' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' --include='*.tf' --include='*.yml' . | grep -v node_modules | grep -v 'docs/superpowers'`
Expected: only intentional residuals (none ideally). Fix stragglers.

- [ ] **Step 8: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "refactor(web): genericize shell/nav/realtime/chat; regenerate shared-types + arch tests"
```

**Gate:** `pnpm type-check && pnpm lint && pnpm build` all pass; grep-for-sally clean (outside docs).

---

## Phase 7: Other apps, infra parameterization, CLAUDE.md, docker, CI

**Files:** `apps/{console,deck,studio}`, infra/terraform, docker-compose, .github, CLAUDE.md, README.

- [ ] **Step 1: Decide secondary apps.** `apps/console` is the super-admin/ops UI (platform — keep, genericize branding). `apps/deck` (marketing/pitch) and `apps/studio` (likely domain authoring) — inspect; if domain/marketing, delete; if platform, genericize. Default: delete `deck` + `studio` unless clearly platform; update `pnpm-workspace.yaml` + root scripts accordingly.

- [ ] **Step 2: Terraform parameterization.** Per §10: set `var.project` default to `app`; replace hardcoded `sally-terraform-state` (use `__PROJECT__` token + a note in `infra/README.md` to `-backend-config`), ECR repos → `${local.prefix}-ecr-*`, CloudWatch `/sally/`→`/${var.project}/`, RDS username/secret names, IAM state-bucket ARNs, `cdn.tf`/`doppler.tf` names. Rename `infra/observability/grafana/.../datasources/sally.yaml`→`datasources.yaml`. Provide `environments/*.tfvars.example`.

- [ ] **Step 3: docker-compose + CI.** `docker-compose.yml`: rename container_names/network/db creds (`app` db, `postgres/postgres`). `.github/workflows/{ci,quality-gate,deploy-all,deploy-frontend,docs}.yml`: rename `--filter=@app/*` (done via Phase 2 but verify), default URLs, `ECR_REPOSITORY`, Firebase placeholder block; drop `docs.yml` if mkdocs removed.

- [ ] **Step 4: CLAUDE.md + README.** Rewrite `CLAUDE.md`: keep generic conventions (camelCase, enum-codegen, UI standards, Doppler, branching, screenshots rule); strip "What is SALLY", the backend-domain table, `@appshore.in` emails, Obsidian workflow. Write a new top-level `README.md`: what the starter is, the two run modes (`MULTI_TENANT=true|false`), quick start (`docker compose up`, `pnpm install`, migrate, seed, `pnpm dev`), and the extension points (`domains/`, MCP `providers[]`, Desk registry, integrations `VENDOR_REGISTRY`, add a domain feature folder).

- [ ] **Step 5: `.gitignore` audit + `.env.example` completeness.** Ensure `.env`, `*.tfstate`, `firebase-admin-sdk.json`, `node_modules`, build dirs are ignored; every required env var is present in `.env.example` files with placeholder values.

- [ ] **Step 6: Commit.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "chore: parameterize infra/docker/CI; rewrite CLAUDE.md + README; finalize secondary apps"
```

**Gate:** `pnpm build` still green; grep-for-sally clean repo-wide (outside docs).

---

## Phase 8: Boot & verify MULTI-TENANT (the real test)

**Files:** none — runtime verification.

- [ ] **Step 1: Start infra.**

Run: `cd ~/code/app-foundation && docker compose up -d postgres redis && sleep 6`
Expected: postgres + redis healthy.

- [ ] **Step 2: Migrate + seed (MT mode).**

```bash
cd ~/code/app-foundation/apps/backend
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app?schema=public" MULTI_TENANT=true
npx prisma migrate deploy && npx prisma generate && pnpm db:seed 2>&1 | tail -20
```
Expected: migration applied, seeds run (super-admin, plans, model-pricing), no errors.

- [ ] **Step 3: Boot backend, hit health + login + AI chat + MCP.** Start backend (`pnpm start:dev` or `pnpm dev` in apps/backend, background), wait for listen, then:

```bash
curl -fsS localhost:8000/health
# dev login (DEV_AUTH_SECRET path) -> capture JWT, then:
# POST /conversations  -> create
# POST /conversations/:id/messages {"content":"hello"} -> expect streamed assistant text (0: frames)
# GET  /api/v1/mcp tools/list (or _internal/mcp) -> expect [] tools
```
Expected: health 200; a conversation streams a generic assistant reply; MCP `tools/list` returns empty array. Fix until all pass (use Playwright MCP or curl; dev-auth guard enables login without Firebase).

- [ ] **Step 4: Boot web, log in, send a chat.** Start `apps/web` dev server; with Playwright MCP: load `/login`, complete dev login, confirm the app shell renders with the 3-item sidebar, open AI Assistant, send "hello", confirm a streamed reply renders. Screenshot.

- [ ] **Step 5: Record evidence + commit any fixes.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "fix: multi-tenant boot verification (health + login + AI chat + empty MCP green)" || echo "no fixes needed"
```

**Gate:** backend health 200; AI chat streams; MCP empty; web login + chat work end-to-end (screenshot captured).

---

## Phase 9: Verify SINGLE-TENANT mode

**Files:** none — runtime verification with flags flipped.

- [ ] **Step 1: Reset DB, seed implicit tenant.**

```bash
cd ~/code/app-foundation/apps/backend
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app?schema=public" MULTI_TENANT=false IMPLICIT_TENANT_ID=1
npx prisma migrate reset --force && pnpm db:seed 2>&1 | tail -20
```
Expected: exactly one Tenant row + admin seeded.

- [ ] **Step 2: Boot backend (ST), verify login needs no tenant + chat works.** Start backend with `MULTI_TENANT=false`; dev-login a user with no tenant claim; confirm `TenantGuard` does NOT 401 and queries resolve to the implicit tenant; send an AI chat message → streamed reply.

- [ ] **Step 3: Boot web (ST), verify tenant UI hidden.** Start web with `NEXT_PUBLIC_MULTI_TENANT=false`; with Playwright MCP: `/login` shows generic branding (no subdomain/branding fetch), login works on plain origin, no tenant switcher, AI chat streams. Screenshot.

- [ ] **Step 4: Commit any fixes.**

```bash
cd ~/code/app-foundation && git add -A && git commit -m "fix: single-tenant boot verification (implicit tenant + hidden tenant UI green)" || echo "no fixes needed"
```

**Gate:** ST backend login works without tenant claim; ST web hides tenant UI; chat works in both modes (screenshots captured for both).

---

## Phase 10: Push to GitHub as a template repo

**Files:** none — publish.

- [ ] **Step 1: Final secret + build gate.**

Run:
```bash
cd ~/code/app-foundation
find . -name '.env' -not -path '*/node_modules/*'; find . -name '*.tfstate*'; find . -name 'firebase-admin-sdk.json'
pnpm build
```
Expected: no secret files; build green.

- [ ] **Step 2: Create the GitHub repo + push.**

```bash
cd ~/code/app-foundation
gh repo create app-foundation --private --source=. --remote=origin --description "Domain-free platform starter (multi/single tenant) cloned from the Sally platform foundation" --push
```

- [ ] **Step 3: Mark as template repo.**

```bash
gh repo edit --template
```

- [ ] **Step 4: Final report.** Summarize: repo URL, both run modes, extension points, what was kept/stripped, and verification evidence.

**Gate:** repo pushed, marked template, builds from a fresh `pnpm install`.

---

## Self-Review (executor: read before starting)

- **Spec coverage:** every spec section maps to a phase — §3 seam→P1, §5 tenancy→P5+P8/9, §6 AI/MCP→P4, §7 prisma→P3, §8 shared-types→P6, §9 naming→P2+P7, secrets→P0/P7/P10. ✅
- **Risk order:** schema pruning (highest risk) is P3 before the backend genericize that depends on the new client. ✅
- **Verification:** type-check gates after P4/P5/P6; runtime boot gates in P8/P9 are the real proof. ✅
- **Autonomy:** user asked to run to completion without pausing — execute all phases, validate at each gate, fix until green, report at the end.
