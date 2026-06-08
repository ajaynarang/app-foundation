I'll synthesize the per-slice maps into a comprehensive seam report. The JSON contains all the analysis I need; let me produce the deliverable directly.

# Platform-vs-Domain Seam Report: Sally → Domain-Free "Golden Starter" Template

## 1. Executive seam summary

The seam in this codebase is unusually clean because the monorepo is already built DDD-style with a hard architectural boundary: **platform infrastructure lives in `src/auth`, `src/config`, `src/infrastructure`, `src/shared`, `src/health`, `src/dev`, the `platform/billing/integrations(framework)/admin` domains, the `ai` agent-runtime skeleton, and the `desk` workflow engine — while the trucking domain is quarantined inside `src/domains/{fleet,routing,financials,operations,analytics,home}` plus the *contents* (not the shells) of `integrations` vendors, `prompting` payloads, and `ai/mcp/tools`.** Almost every platform mechanism is generic; coupling shows up in three predictable forms: (a) **enum/constant catalogs** (Prisma `UserRole`/`NotificationType`/`AiSurface`, `EVENT_REGISTRY`, `QUEUE_NAMES`, `DOMAIN_TO_SSE`, scope vocab, cache namespaces) that enumerate trucking concepts; (b) **branding strings** (`SALLY`, `sally-*` cookies/buckets/packages, plan tier names Haul/Fleet/Freight-Force); and (c) **`.include({ driver, customer })` joins / domain FK columns** bolted onto otherwise-generic auth/user/conversation shapes. Multi-tenancy is convention-based (a global guard chain guarantees a tenant is present + every query manually filters `where: { tenantId }`; there is NO Prisma middleware), which makes single-tenant mode a pure guard/strategy short-circuit plus one seeded implicit tenant — **zero query rewrites needed**. The result: keep ~70% of the backend infra files verbatim, genericize ~20% (strip catalogs/branding/joins in place), delete the `domains/{trucking}` trees, ship an empty-but-working MCP toolset and a single generic AI chat agent.

---

## 2. Target repo structure

```
golden-starter/                         # was: sally/
├── apps/
│   ├── backend/                        # NestJS + Prisma + Postgres
│   │   ├── prisma/
│   │   │   ├── schema.prisma            # ~35 platform models (slimmed Tenant/User), genericized enums
│   │   │   ├── migrations/0_init/       # ONE fresh migration (not the 276-file history)
│   │   │   └── seeds/                   # 01-super-admin, 02-feature-flags, 07/08-plans,
│   │   │                                # 10-vendor-configs, 12-add-ons, 13-desk(opt), 14-model-pricing
│   │   ├── scripts/
│   │   │   └── generate-shared-enums.ts # prisma-enum → zod codegen (PATTERN kept)
│   │   └── src/
│   │       ├── main.ts                  # bootstrap, Swagger params, OAuth metadata (no Desk import)
│   │       ├── app.module.ts            # ConfigModule, pino, Throttler, Prisma, Auth, Cache, Queue,
│   │       │                            # EventBus, Health, Webhooks, Dev, Entitlements; APP_GUARD chain
│   │       ├── worker.ts                # BullMQ worker entrypoint
│   │       ├── auth/                     # JWT/refresh/Firebase/PIN/OTP, guards (Jwt/Tenant/Roles/Plan)
│   │       ├── config/                  # Zod configuration loader, firebase init
│   │       ├── constants/               # auth + (genericized) cache constants
│   │       ├── health/                  # Terminus DB+Redis probes
│   │       ├── dev/                      # dev-auth guard + impersonation (no Desk sweep)
│   │       ├── infrastructure/
│   │       │   ├── cache/  database/  events/  logging/  notification/
│   │       │   ├── outbound-webhooks/  push/  queue/  retry/  sms/  sse/
│   │       │   ├── storage/ (S3)  telemetry/ (OTel+Langfuse)  sync/
│   │       │   └── (REMOVED: webhooks/[inbound Samsara], mock/, sync/{vendor-data,telemetry}.processor)
│   │       ├── shared/                   # filters, utils, validators, services, base-tenant.controller
│   │       ├── architecture/             # fitness tests (queue/jobId kept; status-DTO regenerated)
│   │       └── domains/
│   │           ├── platform/             # entitlements (plans/add-ons/feature-flags), tenants, users,
│   │           │                         # invitations, settings, oauth-provider, api-keys, feedback,
│   │           │                         # announcements (NO reference-data, NO add-on trucking catalog)
│   │           ├── billing/              # Stripe subscriptions + wallet + dunning (KEEP whole)
│   │           ├── integrations/         # framework only: controller/service/vendor-registry types/
│   │           │                         # adapter-factory/credentials/oauth (EMPTY vendor catalog)
│   │           ├── notifications/        # multi-channel dispatcher (re-homed from operations/)
│   │           ├── support/              # ticketing (re-homed from operations/)
│   │           ├── admin/                # super-admin infra console (jobs/events/cache/schedules/ai-spend)
│   │           ├── ai/                   # chat + agent runtime + EMPTY mcp + mcp-server + KB + RLS
│   │           ├── desk/                 # OPTIONAL workflow engine (core+shared-steps, empty responsibilities)
│   │           └── prompting/            # prompt mgmt engine (one generic assistant fallback)
│   └── web/                             # Next.js 15 App Router
│       ├── next.config.ts  tailwind.config.ts  tsconfig.json  components.json
│       ├── public/                       # neutral favicon/manifest/logo
│       └── src/
│           ├── app/                      # login, forgot/reset-password, oauth/consent, maintenance,
│           │                             # api/dev, settings shell, root layout/providers/error
│           │                             # (REMOVED dispatcher/driver/customer/admin-domain/marketing)
│           ├── features/
│           │   ├── auth/                  # store + Firebase exchange (neutral roles)
│           │   └── platform/
│           │       ├── ai/ (chat)         # was sally-ai: generic streaming chat + pluggable card registry
│           │       ├── settings/ users/ admin/ onboarding/ tour/
│           │       ├── plans/ billing/ feature-flags/ api-keys/ oauth-clients/ webhooks/
│           │       └── (REMOVED fleet/routing/operations/financials/desk/horizon/edi/etc.)
│           └── shared/                   # ui/, layout/, lib/ (api client, navigation, tenant-url),
│                                         # realtime/ (SSE bus, empty invalidation map), command-palette/
├── packages/
│   ├── ui/                              # @app/ui — shadcn/Radix primitives, tailwind preset (rename SallyInsight)
│   ├── shared-types/                    # @app/shared-types — platform Zod schemas + codegen mechanism
│   └── test-utils/                      # @app/test-utils — auth fixtures, playwright client, common factory
│       (REMOVED: packages/screenshots)
├── infra/
│   ├── terraform/                       # VPC/ECS/ALB/RDS/Redis/S3/IAM/CloudWatch/Scheduler/Doppler
│   │   └── environments/*.tfvars.example
│   ├── bootstrap/                       # state-bucket bootstrap (NO committed tfstate)
│   └── observability/                   # Loki + Tempo + Grafana (LGTM)
├── tools/                              # db migrate/tunnel, dev install/kill-port/launcher
├── tests/                             # @app/qa — Playwright runner + smoke/security-headers (regen rbac)
├── docker-compose.yml                 # pgvector/pg16 + redis:7 + observability profile + inngest(opt)
├── turbo.json  pnpm-workspace.yaml  package.json  .github/workflows/  .husky/  CLAUDE.md
```

---

## 3. KEEP-AS-IS inventory (consolidated by area)

### Backend bootstrap / auth / config
- `src/worker.ts` — generic BullMQ worker entrypoint (log strings only).
- `src/auth/jwt.service.ts`, `pin.service.ts`, `login-event.service.ts`, `login-event-cleanup.processor.ts`, `firebase-auth.service.ts`.
- `src/auth/strategies/{refresh-jwt}.strategy.ts` (jwt.strategy needs join-strip — see §4).
- `src/auth/guards/{jwt-auth, tenant, roles, refresh-jwt-auth}.guard.ts`.
- `src/auth/decorators/{public, current-user, roles, require-feature}.decorator.ts`.
- `src/config/firebase.config.ts`; `src/constants/auth.constants.ts`.
- `src/health/*` (controller, module, redis indicator).
- `src/dev/guards/dev-auth.guard.ts`, `src/dev/dev-auth.constants.ts`.
- `src/test/mocks/*`, `src/test/helpers/*`, `src/test/factories/{user,tenant}.factory.ts`.

### Infrastructure (cross-cutting platform spine)
- **cache/**: `cache.module.ts`, `redis-client.provider.ts`, `sally-cache.service.ts` (rename class), `cache-key.constants.ts`.
- **database/**: `prisma.service.ts`, `prisma.module.ts`, `counter.service.ts`.
- **events/** (mechanism): `domain-event.ts`, `domain-event.service.ts`, `event-bus.module.ts`, `event-context.ts`, `event-context.interceptor.ts`, `durable-event.processor.ts`, `durable-event.types.ts`, `event-persistence.subscriber.ts`, `tenant-id-resolver.service.ts`, `payloads/base.ts`, and the `EventDefinition` interface + lookup helpers from `event-registry.ts` (the `EVENT_REGISTRY` *array* is stripped — file must be split).
- **logging/**: `pino-transport.ts`, `log-filter.ts`, `request-context.middleware.ts`, `trace-context.ts`, `job-log-context.ts`.
- **notification/**: `notification.module.ts`, `dto/notification-filters.dto.ts` (service/email need template-strip — §4).
- **outbound-webhooks/** (entire dir): dispatcher, delivery.processor, subscription service+controller, webhook-url.validator (SSRF), module, dto/*.
- **push/**: push.service, push-subscription.controller, push.module.
- **queue/** (mechanism): `base-queue-dispatcher.ts`, `job-handler.contract.ts`, `job-envelope.helper.ts`, `dead-letter.service.ts`, `vendor-circuit-breaker.service.ts`, `bull-board-auth.middleware.ts`, `schedule-manager.service.ts`, `job-cleanup.job.ts`, `data-retention.{processor,module}.ts`, `placeholder.processors.ts`.
- **retry/**, **sms/** (sms.service, sms.module, twilio-verify.service), **sse/** (sse.service, sse.controller, sse.module), **storage/** (storage.module + file-storage mechanism), **telemetry/** (telemetry.ts), **sync/** (sync-action-log.ts, sync-queue.module.ts).

### Shared
- `filters/http-exception.filter.ts`; `utils/{uuidv7,id-generator,env-type,pagination,calendar-date,cron-window,date-range,validation-exception-factory}.ts`; `validators/is-iana-timezone.validator.ts`; `services/{timezone,tenant-job-run}.service.ts`; `lib/arrival-time.ts`; `shared.module.ts`.

### AI / agent / MCP skeleton (keep unchanged)
- `domains/ai/mcp-server/**` (external OAuth/API-key MCP server, registry-driven, serves zero tools).
- `domains/ai/agent-contract/**` (ScopeRegistry, InvocationPipeline, ToolExecutor, HITL, AgentInvocationLogger, RateLimit) — scope *vocab* genericized.
- `domains/ai/infrastructure/**` (ai-provider, embedding, structured-output, ai-telemetry, langfuse-session, idempotency, pii-redactor).
- `domains/ai/rls/**` (AiPrismaService RLS context).
- `domains/ai/knowledge-base/{knowledge-base,ingestion}.service.ts`, `ingestion.command.ts` (content repointed).
- `domains/ai/moderation/**`.
- `domains/prompting/prompting.service.ts`, `prompting.module.ts` (payload swapped).
- `domains/desk/core/**`, `desk/shared-steps/**`, `desk/responsibilities/definition.types.ts` (engine only).
- `domains/ai/sally-ai/utils/{pipe-agent-response,parse-followups}.ts`, `services/conversation-session.service.ts`.

### Domains (platform)
- `domains/admin/**` (super-admin job/event/cache/schedule/ai-spend consoles).
- `domains/billing/**` (Stripe subscription + wallet + dunning + webhook — KEEP whole).
- `domains/integrations/credentials/**` (AES-256 encryption), `domains/integrations/oauth/**` (connect/callback/refresh).

### Prisma platform models (keep)
Tenant (slimmed), User (slimmed), RefreshToken, LoginEvent (+enums), ApiKey, SuperAdminPreferences, FeatureFlag, PushSubscription, Conversation/ConversationSession/ConversationMessage (sever joins), KnowledgeDocument (pgvector), AiInvocation/ModelPricing/TenantAiBudget, AgentInvocationLog, HitlChallenge, Notification (+Channel/Category/Status), WebhookSubscription/WebhookDeliveryLog, DomainEventLog, DeadLetterLog, Job/JobSchedule, TenantCounter, TenantJobRun, OAuthClient/AuthorizationCode/AccessToken/RefreshToken, UserPreferences, ProcessedBillingEvent, UserInvitation (sever joins), Feedback, Announcement, VendorConfig.

### Web (platform)
- `tsconfig.json`, `components.json`.
- `src/app/providers.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, `settings/layout.tsx`.
- `src/app/{reset-password,forgot-password,oauth/consent,maintenance}/**`, `src/app/api/{maintenance-status,dev}/**`.
- `src/shared/lib/navigation.ts` route-guard helpers (`isProtectedRoute`/`isPublicRoute`/`isSafeInternalPath`/`getReturnToUrl`/`resolvePostLoginRedirect`/`getValidToken`) — nav *config* stripped.
- `src/components/ui/`, `src/shared/components/ui/`, `src/shared/lib/utils/`, `src/shared/lib/api/{client(strip leak),index}.ts`, `src/shared/lib/{motion,firebase,sentry,toast,error-utils,colors,date-utils,format-time,search,tenant-url,console-url,access-environments}.ts`.
- `src/shared/stores/sheet-size.store.ts`; `src/shared/hooks/{use-debounce,use-is-mobile,use-long-press,use-network-status,use-sheet-sizing,use-app-hotkeys,use-push-notifications}.ts`.
- `src/shared/providers/PreferencesProvider.tsx`; `src/shared/components/common/{ThemeProvider,providers/auth-provider,error-boundary-content,network-status-banner,dev-banner}.tsx`, `dev/`, `cookie-consent/`, `page-chrome/`, `console-redirect-stub.tsx`; `src/shared/config/query-tiers.ts`.

### packages / infra / tools / tests
- `packages/shared-types/src/platform/*`, `src/constants/pagination.constants.ts`, `src/utils/{format,time}.ts`, `src/infrastructure/{job-envelope,sse-events,webhook.schema}.ts`, `src/ai/{agent-scopes(vocab regen),spend,telemetry,capability,model-alias,agent-activity}.schema.ts`.
- `packages/ui/src/components/ui/` (37 primitives), `lib/{utils,toast}.ts`, `hooks/use-is-mobile.ts`, `styles/globals.css`, `tailwind-preset.ts`.
- `packages/test-utils/src/auth/`, `playwright/api-client.ts`, `factories/common.ts`.
- **infra/terraform**: `main.tf`, `variables.tf`, `vpc.tf`, `ecs.tf`, `alb.tf`, `rds.tf`, `elasticache.tf`, `s3.tf`, `iam.tf`, `cloudwatch.tf`, `scheduler.tf`, `doppler.tf`, `outputs.tf` (all already `local.prefix`-parameterized; hardcodes in §10). **infra/bootstrap/main.tf** (exclude committed tfstate). **infra/observability/{loki,tempo,grafana}**.
- **tools/**: `db/{migrate,tunnel}.sh`, `dev/{install,kill-port,sally-dev}.sh`.
- **root**: `docker-compose.yml`, `turbo.json`, `pnpm-workspace.yaml`, `.husky/pre-commit`, `.github/workflows/{ci,quality-gate,deploy-all}.yml`.

---

## 4. KEEP-BUT-GENERICIZE inventory

### Backend bootstrap / auth
| File | Coupling to remove → becomes |
|---|---|
| `src/main.ts` | Strip Swagger title `SALLY API`/`Fleet Operations Assistant API` + domain tags (Route Planning/HOS/Drivers/Vehicles/Loads); CSP pinned to Sentry CDN → parameterize; `OAUTH_ISSUER` default `https://api.trysally.com` → env; **remove `setNestAppContext` import from `domains/desk/core/inngest/nest-context`** (make it a pluggable post-bootstrap hook); `OAUTH_SCOPES` import → genericized. Keep all helmet/CORS/ValidationPipe/cookie/well-known/OTel-flush logic. |
| `src/app.module.ts` | Remove every domain module import (Fleet/Routing/Financials/Operations/Billing-domain/Analytics/Home/Desk-domain/Ai-domain/LoadBoard/Integrations-vendor/Admin*/Prompting) + domain queue dispatchers (documents/safety-detect/geo-compute/finance/vendor-data). **Keep** the `APP_GUARD` chain (Throttler→Jwt→Tenant→Roles→Plan), `RequestContextMiddleware`, pino mixin, slimmed entitlements module (needed by PlanGuard), Notifications/BulkOps dispatchers. |
| `src/config/configuration.ts` | Strip `osrmUrl`, `hereApiKey`, `hereTollsApiKey`, `routingProvider`, `openWeatherApiKey`, `gasbuddyApiKey`, `pcmilerApiKey`, the `platform*Provider` block, `ratecon.*`. Rename `projectName 'SALLY Backend'`. Keep `anthropicApiKey` (generic LLM). Add `multiTenancy.enabled` + `implicitTenantId` (see §6). |
| `src/auth/auth.service.ts` | Strip every `.include({ tenant, driver, customer })` join → keep `tenant` only; drop returned `driverId/driverName/customerId/customerName/subdomain`. Keep all flows (Firebase exchange, phone PIN/OTP, refresh, profile, set-PIN). Keep `lookupUser` multiTenant flag. |
| `src/auth/auth.module.ts` | Keep wiring; ensure `jobSchedule`/`BULK_OPS` queue infra ships (login-events-cleanup repeatable job). |
| `src/auth/auth.controller.ts` | Strip cookie-domain comments (`*.sally.appshore.in`) + `driverId` from returned user. Keep all endpoints + `COOKIE_DOMAIN` env. |
| `src/auth/strategies/jwt.strategy.ts` | In `validate()` strip `{driver, customer}` include + `driverId/driverDbId/driverName/customerId/customerDbId/customerName`. Keep `tenantId/tenantDbId/tenantName/dbId/userId/role`. |
| `src/auth/strategies/refresh-jwt.strategy.ts` | Strip driver include + `driverId/driverName`. |
| `src/auth/guards/plan.guard.ts` | Keep the entitlement mechanism (flag kill-switch → SUPER_ADMIN bypass → plan/add-on resolution → 403). Replace `getRequiredPlan()` displayName map (`Haul/Fleet/Freight Force`) with neutral tiers. Keep dependency on slimmed Plans/AddOns/FeatureFlags services. |
| `src/constants/cache.constants.ts` | Keep tiered TTLs + prefix convention. Strip `CACHE_NAMESPACES` array (sally:loads/invoicing/dispatch/eld/tower/desk…) + `TOWER_CACHE_NAMESPACE`. |
| `src/constants/index.ts` | Re-export genericized cache constants. |
| `src/dev/dev.controller.ts` | Keep impersonation (list-by-tenant/role, switch-user→JWT). Remove desk/bootstrap-sweep endpoint + `DeskBootstrapService`. |
| `src/dev/dev.module.ts` | Remove `DeskResponsibilityModule` import. |
| `src/dev/dev.service.ts` | Strip driver includes; trim `ROLE_ORDER` to platform roles (OWNER/ADMIN/SUPER_ADMIN), drop DISPATCHER/DRIVER/CUSTOMER. |

### Infrastructure
| File | Coupling to remove → becomes |
|---|---|
| `cache/cache-invalidation.subscriber.ts` | Keep `@OnEvent` + throttle shell; replace entire `getInvalidationsForEvent` switch (LOAD_*/ALERT_*/FACTORING_*/TRIP_*/SHIELD_*/DESK_* → sally:* namespaces) with new domain mapping. Remove `TOWER_CACHE_NAMESPACE` import. |
| `sse/domain-event-sse-bridge.service.ts` | Keep routing engine (tenant/user scoping, `recipientUserIds` contract). Regenerate `DOMAIN_TO_SSE` (~70 entries) + drop `TOWER_LOAD_FANOUT`. |
| `sse/sse-events.constants.ts` | Re-export from genericized shared-types `SSE_EVENTS`. |
| `events/sally-events.constants.ts` | Rename `SALLY_EVENTS`/`SallyEventName` → `DOMAIN_EVENTS`/`DomainEventName`; keep literal-preserving derive-from-registry pattern. |
| `queue/queue.constants.ts` | Keep `bullJobIdFromDbId()` + `QUEUE_NAMES`/`QueueName` typing. Replace tier comments + all `*_JOB_NAMES` maps (TELEMETRY/VENDOR_DATA/FINANCE/SAFETY_DETECT). |
| `queue/queue.module.ts` | Keep BullMQ root + Bull Board + JWT guard. Parameterize the 14-queue trucking-tier list → generic queues (events, notifications, webhooks, bulk-ops, + reserved ai-interactive/ai-background). |
| `queue/job.types.ts` | Keep `JOB_CATEGORIES` model + `cronToHuman()`. Regen category contents + `MANUAL_CATEGORY_TYPES`; remove `TYPE_DISPLAY_NAMES` shared-types import or genericize. |
| `queue/dispatchers/*.{processor,module}.ts` | Pure DI/`BaseQueueDispatcher` subclasses — keep pattern, rename/repurpose per new queue set (notifications/bulk-ops are already generic). |
| `sync/integration-job-router.ts`, `sync/sync-job.types.ts` | Keep `routeIntegrationJob()` shape + envelope; strip ELD/TMS routing tables + `TelemetryJobType`/`VendorDataJobType` unions + `integrationType:'TMS'|'ELD'`. |
| `notification/notification.service.ts` | Keep generic create/dispatch/inbox core. Strip `NotificationType.TENANT_REGISTRATION_*` bespoke methods (`sendTenantRegistrationConfirmation` etc.) — re-home as app-level. |
| `notification/services/email.service.ts` | Keep transport; tenant-registration/approval templates are app content → replace. |
| `storage/file-storage.service.ts` | Strip default bucket `sally-documents` → env; remove `generateRateconUploadKey()`. Keep presigned up/download + key sanitization + `tenants/{tenantId}/...` layout. |
| `shared/base/base-tenant.controller.ts` | Keep `getTenant/getTenantDbId/getUserDbId/validateTenantAccess`. Remove `assertDriverScopedAccess()`/`assertHasDriverProfile()` (move to fleet — i.e. delete). |
| `shared/guards/external-source.guard.ts` | Keep "read-only if external-sourced" pattern; parameterize resource lookup instead of switching on `prisma.driver`/`prisma.vehicle`. |
| `shared/constants/scheduling.constants.ts` | Keep `DIGEST_LOCAL_HOUR`; replace `TENANT_JOB_KEYS` (`ALERT_DIGEST`/`SHIELD_AUDIT`). |

### AI / agent / MCP (genericize — this is the empty-MCP work)
| File | Coupling to remove → becomes |
|---|---|
| `ai/mcp/mcp-tools.module.ts` | **THE extension point.** Keep `McpModule.forRoot({name,mcpEndpoint:'_internal/mcp'})` + `McpToolService` + sample `HealthTool`. Empty `imports[]` (~25 domain modules) and `providers[]` (~60 tools). Comment: "register your @Tool providers here". |
| `ai/mcp/mcp-tool.service.ts` | Keep MCP→AI-SDK bridge. Strip `persona.config` import + static `WRITE_TOOLS` (SEND_INVOICE/ASSIGN_LOAD/TERMINATE_DRIVER…) → empty set. |
| `ai/mcp/tools/health.tool.ts` | Keep as canonical sample; re-scope `fleet:read`→`platform:read`, neutralize description. |
| `ai/ai.module.ts` | Drop `DocumentIntelligenceModule` (+`VoiceModule` if text-only). Rename `sally-ai`/`Sally`. |
| `ai/sally-ai/sally-ai.controller.ts` | Keep `@Controller('conversations')` endpoints. Genericize `@Roles` list + agent-status. Rename folder. |
| `ai/sally-ai/sally-ai.service.ts` | Strip per-persona greetings, moderation-block copy ("fleet operations… routes, drivers, loads, HOS"), `BRIEFING` promptKey special-casing. Keep stream skeleton (text/card/suspend/followups) + HITL resume. |
| `ai/sally-ai/sally-ai.module.ts` | Reduce `AgentsModule` (12 agents → 1); strip Prospect controller/service + CapabilityRegistry. |
| `ai/sally-ai/mastra/mastra.provider.ts` | Keep Mastra+Memory(PostgresStore)+Langfuse wiring. Replace 12 trucking agents + extraction agents with ONE generic `assistant`. |
| `ai/sally-ai/mastra/tools/{confirm-action,delegate-to-agent}.tool.ts` | Keep; drop specific trucking agent-id references. |
| `ai/agents/{base.agent,agent.types,agent.registry,agents.module}.ts` | Keep `AbstractBaseAgent` template; replace `UserMode`/`AGENT_IDS` unions with neutral values; registry/module → one agent. |
| `ai/orchestrator/{sally-router,skill-classifier,orchestrator.module}.ts` | Keep 3-stage routing; replace `PERSONA_DEFAULT_AGENT`/`SINGLE_DOMAIN_PERSONAS` maps; default to single generic agent. |
| `agent-contract/scope-registry.constants.ts` | Keep `PERMANENTLY_EXCLUDED_TOOL_NAMES` + `SCOPE_IMPLICATIONS` shape + generic scopes (platform/desk/comms/documents/alerts/integrations); strip trucking pairs (fleet/loads/invoices/settlements/customers/shield). |
| `agent-contract/role-scopes.ts` | Keep `scopesForRole()` + derive-from-`AgentScopeSchema` pattern; genericize role names + scopes. |
| `prompting/registrars/{chat-prompt,service-fallback}.registrar.ts` | Keep registrar pattern; replace bodies with one generic assistant fallback / empty extraction content. |
| `prompting/prompting.types.ts` | Keep `PROMPT_NAMES` registry + `SkillMetadata`/`ParsedSkill` interfaces; replace Sally keys. |
| `prompting/prompts/persona/persona.config.ts` | Keep `PersonaConfig` interface + `getPersonaConfig`; replace ~400 lines of configs with generic personas, empty `allowedTools`. |
| `ai/knowledge-base/content/content-loader.ts` | Keep loader; repoint `content/{knowledge-base,product-manual}` dirs, genericize audience enum. |
| `desk/core/inngest/inngest.controller.ts` | Keep `/inngest` serve handler; reduce hardcoded 4-responsibility + `deskScheduler` functions array. |
| `desk/responsibilities/index.ts`, `desk.module.ts`, `desk-responsibility.module.ts` | Keep `RESPONSIBILITY_REGISTRY` + helpers; empty array or seed one generic example. |

### Domains (platform, genericize)
| File | Coupling → becomes |
|---|---|
| `operations/notifications/**` | **Re-home to `domains/notifications/`.** Keep multi-channel dispatcher (in-app/push/sms/email), `channel-resolution`, `notification-triggers` (categories SYSTEM/TEAM/BILLING are generic), cleanup processor. Genericize `SALLY_EVENTS` import + Prisma `NotificationType` trucking values. |
| `operations/support/**` | **Re-home to `domains/support/`.** Keep ticketing CRUD (ST-#### sequence); strip Sally branding in DTOs/copy. |
| `integrations/` framework files | Keep `integrations.controller/service`, `vendor-registry` types + helpers, `adapter-factory.service`, `adapters.module`, `dto/`. Empty `VENDOR_REGISTRY` const + remove `@Module` imports of accounting/edi/load-board/sync. Optionally one generic example connector. |
| `integrations/email-intake/**` | Keep inbound-Resend receiver/filter/thread-tracker. Strip routing into `LoadsModule`/`DocumentIntelligence`. |

### Web
| File | Coupling → becomes |
|---|---|
| `src/middleware.ts` | Keep auth+tenancy engine. Rename cookies `sally-auth`/`sally-role`, header `x-tenant-slug`; remove marketing public-prefixes + DISPATCHER/DRIVER/CUSTOMER role map + `/dispatcher`/`/driver`/`/customer` `PROTECTED_PREFIXES`. Gate subdomain extraction behind `isMultiTenant()` (§6). |
| `src/app/layout.tsx` | Replace all metadata (title/description/keywords/openGraph/twitter/manifest), `sally:font-size-scale` localStorage key. Keep fonts/ThemeProvider/Providers/Toaster/CookieConsent. |
| `src/app/layout-client.tsx` | Keep layout-selection + auth-guard. Genericize `SallyGlobalProvider` mount + `role==='DRIVER'` driver-layout branch. |
| `src/app/login/page.tsx`, `features/auth/components/login-form.tsx` | Gate `/tenants/branding/${slug}` fetch + cross-subdomain relay behind MT toggle. Replace copy ("Smart Routes…", "Running a fleet? Set up SALLY →"). Keep multi-step email/phone/PIN/OTP. |
| `features/auth/store.ts` | Rename cookies + persist key; gate `getCookieDomain()` subdomain logic behind MT toggle; replace User role union; drop driver/customer fields. Keep Firebase→JWT exchange. |
| `shared/lib/tenant-url.ts`, `shared/components/common/providers/auth-provider.tsx` | Add `isMultiTenant()` short-circuit returning null/no-op; gate SSO-relay hash branch. |
| `public/site.webmanifest` | Replace name/short_name/description/icons. |
| `next.config.ts` | Rename `@sally/shared-types`, S3/CDN origins in CSP; drop `/dispatcher/insights/ar-aging` redirect. Keep CSP/rewrite/headers/standalone. |
| `tailwind.config.ts` | Rename `@sally/ui` preset; optionally drop `hos-*`/`route-draw` keyframes. |
| `features/platform/{ai(chat),settings,users,admin,onboarding,tour,plans,billing,feature-flags,api-keys,oauth-clients},webhooks,add-ons,ai,admin/ai-spend` | Keep shells; genericize role enums, plan/add-on/scope catalogs, surface lists, onboarding/tour step content. All import `@sally/shared-types` → rename + carve generic subset. |
| `shared/components/layout/**` | Keep AppLayout/Header/Sidebar/PublicLayout/NotificationBell/WorkspaceSwitcher. Remove `useCloseOutSummary` import + `/dispatcher` nav + Driver* mobile shells; replace `navigation.ts` content. |
| `shared/components/command-palette/**` | Keep Cmd-K engine; swap providers/registry (currently trucking entities). |
| `shared/realtime/**` | Keep SSE bus/provider/context/hook; replace `invalidation-map.ts` (~80 trucking events → query keys). |
| `shared/constants/{query-keys,storage-keys}.ts`, `config/comingSoonContent.ts` | Keep generic namespaces (preferences/featureFlags/apiKeys/oauthClients/notifications/plans/organization/ai); strip domain ones. Rename `SALLY_*` storage keys. |

### packages / infra / CI (genericize)
- `packages/{shared-types,ui,test-utils,screenshots}/package.json`, `tests/package.json`, root `package.json` — rename `@sally/*` scope (§11). **Note shared-types is Zod ^3.24.2, not v4.**
- `packages/ui/src/index.ts` + `components/ui/sally-insight.tsx` — rename `SallyInsight` → `AIInsight`/`Insight`.
- `infra/terraform/{main,bootstrap/main,ecr,cloudwatch,rds,iam,cdn}.tf` + `environments/*.tfvars` — see §10.
- `infra/observability/grafana/.../datasources/sally.yaml` → `datasources.yaml`.
- `docker-compose.yml` — rename container_names/network/db-creds.
- `.github/workflows/{ci,quality-gate,deploy-all}.yml` — rename `--filter=@sally/*`, default URLs, `ECR_REPOSITORY`, Firebase placeholder block.
- `CLAUDE.md` — keep generic conventions (camelCase, enum-codegen, UI standards, screenshots rule, Doppler, branching); strip "What is SALLY", backend-domain table, @appshore.in emails, Obsidian-wiki workflow.

---

## 5. STRIP inventory

### Backend domains (delete whole trees)
- `domains/fleet/**` — drivers, vehicles, trailers, loads (+ status-machine/legs/stops/dispatch/tracking), trips, customers (+portal), documents, recurring-lanes, stops, search, lane-intelligence, custom-fields.
- `domains/routing/**` — route-planning, hos-compliance, load-mileage, HERE/OSRM/OpenWeather providers.
- `domains/financials/**` — invoicing (+factoring/NOA/doc-bundles), settlements, close-out, payments.
- `domains/analytics/**` — revenue/profitability/driver-performance/fleet-utilization/lane/ar-aging/scorecard/kpi reports, report-export (MC#/DOT# headers).
- `domains/home/**` — dispatcher pulse/recent-loads.
- `domains/operations/{command-center,monitoring,alerts,ifta,shield,horizon}/**` (keep+re-home notifications/ & support/).
- `domains/integrations/{sync,accounting,edi,load-board,adapters/tms}/**`, `services/eld-linking*`, `eld-data-cache.service.ts`, `VENDOR_REGISTRY` const entries.

### AI / desk / prompting payload (delete content, keep shells per §4)
- `ai/mcp/tools/**` (except re-scoped health), all 12 `ai/agents/*.agent.ts` (except base), `ai/document-intelligence/**`, `ai/sally-ai/{prospect.controller,prospect.service,capabilities}/**`.
- `prompting/prompts/persona/{base-prompts,system-prompts.fallback}.ts`, `prompts/skills/{domain,tasks}/**`, `prompts/fallbacks/**`.
- `desk/responsibilities/{ar-followup,closeout-review,document-expiry,settlement-review}/**`, `agent-system-prompts.ts`, `coming-soon.ts`, `desk-prompt.registrar.ts`, `bootstrap-desk-for-tenant.ts`, `desk-bootstrap.service.ts`.
- `domains/platform-services/**` (routing/mileage/tolls/traffic/weather/geocoding/fuel external-data adapters), `domains/platform/reference-data/**`, `domains/platform/add-ons/**` (trucking product packs).

### Infrastructure (delete)
- `infrastructure/events/event-registry.ts` (EVENT_REGISTRY array only — split file), `events/payloads/{load,fleet,trailer,trip,financial,document,operations,integration}-event-payloads.ts` + `payloads/index.ts`.
- `infrastructure/webhooks/**` (INBOUND Samsara: samsara-webhook.service, webhook.types, webhook.controller, webhook.module).
- `infrastructure/sync/{vendor-data,telemetry}.processor.ts`, `infrastructure/mock/{mock.dataset,mock.config}.ts`.
- `architecture/status-endpoints-validation.spec.ts` (imports domain DTOs/enums — regenerate).

### Backend test factories (delete)
`src/test/factories/{driver,vehicle,trailer,load,route-plan,stop,customer,invoice,payment,settlement,alert,document}.factory.ts`, rebuild `factories/index.ts` + `test/index.ts` to user/tenant only.

### Prisma models (delete — see §8 for full list)
Driver, Vehicle, Trailer (+DVIR), VehicleTelematics/DVIR, RoutePlan/RouteSegment/RouteEvent/RoutePlanFeedback, Stop, FuelCardType/BrandFuelCardAcceptance, Customer/CustomerContact, Load (+all children), Trip, MoneyCode, DriverActionRequest, RecurringLane/Stop/LaneRate*, Alert/AlertNote/AlertConfiguration, ShiftNote, EDI*, AccountingAccountMapping, FleetOperationsSettings, BillingOverride, DriverPreferences, Lead, Invoice/LineItem/Payment/Settings/ShareLink, Factoring*, NoaRecord, DriverPayStructure/Settlement*, Shield*, Ifta*, LoadBoardSavedSearch, EmailIngest*, Driver/VehicleUnavailability, DriverFleetPreferences, DriverPerformanceMetrics, ReferenceData, CustomFieldDefinition + ~60 domain enums.

### Web (delete)
- `app/{dispatcher,driver,customer,(super-admin)/admin,admin,agent-actions,track,rest-optimizer,sally-canvas,sally-labs,pricing,product,legal,setup-hub,onboarding}/**`, `app/page.tsx` (marketing landing), `app/{register,registration,accept-invitation}/**` (gate with single-tenant — see §12).
- `features/{fleet,routing,operations,driver,financials,desk,horizon,edi,email-intake,fuel-cards,integrations,analytics,customer,home,system-activity,login-activity,feedback,support,admin-events}/**`.
- `features/platform/{sally-ai cards subtree (keep shell),reference-data,broadcasts,cache-management}/**` — card catalog `engine/types.ts` + `components/cards/*` stripped, `RichCardRenderer` kept as registry.
- `shared/components/common/{dashboard,landing}/**` (trucking viz + marketing).

### packages / tools / tests (delete)
- `packages/shared-types/src/{fleet,financials,routing,operations,desk,integrations,api}/**`, `enums/index.ts` (HOS), `constants/fleet.constants.ts`, `ifta.ts`, `generated/prisma-enums.ts` (regenerate from new schema).
- `packages/test-utils/src/{factories(except common),schemas,helpers}/**`; `packages/screenshots/**`.
- `tests/{api,browser,evals,fixtures}/**`, `tests/rbac/rbac-matrix.generated.ts` content (regenerate).
- `tools/{stripe/sync-products.sh,db/pull-staging.sh,staging,prompts,docs,dev/setup-osrm.sh}`.
- `scripts/export-scope-vocab.ts` (optional pattern only).
- **SECRETS — must not ship:** `infra/bootstrap/terraform.tfstate`, `infra/bootstrap/.terraform/`, `tools/docs/login-cred*.md`, `tools/docs/appshore-in-dns.txt`.

---

## 6. Multi-tenancy → config toggle

### How MT works today
**Backend:** Identity carries the tenant. On login `AuthService` issues a JWT with an optional `tenantId` claim (string business id). `JwtStrategy.validate()` (`src/auth/strategies/jwt.strategy.ts`) loads the User + `tenant` relation and returns BOTH `tenantId` (string, display) and `tenantDbId` (numeric FK for queries) + `tenantName` on `request.user`; SUPER_ADMIN has no tenant. Enforcement is a global guard chain in `app.module.ts` via `APP_GUARD` ordered **ThrottlerGuard → JwtAuthGuard → TenantGuard → RolesGuard → PlanGuard**. `TenantGuard` (`src/auth/guards/tenant.guard.ts`) is the isolation primitive: skips `@Public()`, returns true for `role==='SUPER_ADMIN'`, else **throws `UnauthorizedException('Tenant context missing')`** if `user.tenantId` is absent, and copies `user.tenantId`→`request.tenantId`. **There is NO Prisma middleware** (`prisma.service.ts` is a bare pooled `PrismaClient`); scoping is manual/conventional — every service passes `where: { tenantId }` explicitly via `@TenantDbId()` or `user.tenantDbId`. Observability: `RequestContextMiddleware` seeds AsyncLocalStorage; `JwtAuthGuard.handleRequest` patches it with tenantId/userId; the pino mixin emits tenantId per log line. Subdomain routing is a separate concern gated by `USE_TENANT_SUBDOMAINS`/`TENANT_BASE_URL`/`COOKIE_DOMAIN`.

**Schema:** `Tenant` (lines 184-367) has surrogate `id Int @id` (the FK target) + business key `tenantId String @unique`. Every scoped model carries `tenantId Int @map("tenant_id")` + relation. All composite uniques are tenant-scoped (`@@unique([tenantId, ...])`). Tenant-optional FKs use nullable `tenantId` (User=null for SUPER_ADMIN, anonymous Conversation, etc.).

**Frontend:** Tenant is resolved from hostname only — `extractSubdomain(host)` against `NEXT_PUBLIC_APP_DOMAIN`, implemented twice (`middleware.ts` Edge + `shared/lib/tenant-url.ts`). No tenant-picker UI; only login-page branding fetch (`/tenants/branding/${slug}`). Cross-subdomain SSO relay: login detects `user.subdomain`, `buildTenantRedirectUrl` redirects to `https://{slug}.{APP_DOMAIN}{path}#sso-relay=<token>`, `auth-provider.tsx` hydrates from the hash. Presence cookie `sally-auth` is domain-scoped via `getCookieDomain()`.

### Single-tenant config design (concrete)
Add config flag `multiTenancy.enabled` (env `MULTI_TENANT`, default `false`) + `IMPLICIT_TENANT_ID`/`DEFAULT_TENANT_ID`. Recommended approach is the **DEFAULT-TENANT-ROW pattern** (NOT nullable-everywhere — that would weaken every `@@unique([tenantId,...])` and require NULLS-NOT-DISTINCT handling). Because scoping is convention-based, single-tenant needs **zero query rewrites**:

**Backend short-circuits:**
- `src/auth/guards/tenant.guard.ts` — `canActivate`: if MT disabled, set `request.tenantId = config.implicitTenantId` and return `true` instead of throwing; never require a tenant claim.
- `src/auth/strategies/jwt.strategy.ts` — `validate()`: when disabled, stop requiring/loading the tenant relation; stamp the implicit tenant onto `request.user.tenantId/tenantDbId` so downstream `where:{tenantId}` resolves to the one tenant.
- **Seed exactly one Tenant row** (id=1, the implicit tenant) at bootstrap so manual tenant-scoped queries work unchanged.
- `src/auth/guards/plan.guard.ts` — optionally default the implicit tenant to the top tier so entitlement checks pass.
- Token payload — keep emitting `tenantId = implicit id` so logs/queries stay uniform.
- The only thing to disable in single-tenant mode is the **registration/onboarding flow that creates new Tenants**.

**Frontend short-circuits** (one flag `NEXT_PUBLIC_MULTI_TENANT` + helper `isMultiTenant()`):
- `shared/lib/tenant-url.ts` — `extractSubdomain()`→null; `buildTenantUrl`/`buildTenantRedirectUrl`→path/null; `getCookieDomain()`→undefined (plain-origin cookie).
- `middleware.ts` — skip `extractSubdomain`/`x-tenant-slug` header + subdomain login-redirect branch; always redirect to same-origin `/login`.
- `login/page.tsx` + `login-form.tsx` — skip `/tenants/branding/${slug}` fetch; render generic branding.
- `auth-provider.tsx` — the `#sso-relay` hash branch becomes dead (harmless; can skip).

Net: one implicit tenant, no subdomain parsing, no branding fetch, no relay. Multi-tenant remains a flag flip.

---

## 7. Generic AI + empty MCP

### Working chat — keep these files
**Endpoint:** `domains/ai/sally-ai/sally-ai.controller.ts` → `@Controller('conversations')`: `POST /`, `POST /:id/messages` (send+stream), `GET /`, `GET /:id/messages`, `POST /:id/resume` (HITL), `GET /agents/status`.

**Turn pipeline (all transport-agnostic, keep whole):**
1. `sally-ai.service.ts` `generateResponse` async generator — validate ownership → persist user `ConversationMessage` → input moderation + AI budget gate → `SallyRouterService.route()` picks agent → `AgentRegistry.get(id).chat()` streams from the Mastra agent (`AbstractBaseAgent.chat`) → chunks over the custom protocol (`0:`=text, `8:`=card, `9:`=suspend/HITL, `a:`=followups). HITL resume via `POST /:id/resume`.
2. `mastra/mastra.provider.ts` — Mastra + Memory(PostgresStore lastMessages:40) + Langfuse observability + **one generic `assistant` agent**.
3. `agents/base.agent.ts` (`AbstractBaseAgent`), `orchestrator/{sally-router,skill-classifier}.service.ts` (single-agent default), `prompting/prompting.service.ts` (Langfuse-first + code fallbacks).
4. Supporting: `ai/infrastructure/**` (provider/embedding/telemetry/redaction), `ai/rls/**`, `ai/moderation/**`, `ai/knowledge-base/**` (empty content), `sally-ai/utils/{pipe-agent-response,parse-followups}.ts`, `conversation-session.service.ts`.

**Frontend chat** lives at `features/platform/ai/` (was `sally-ai/`) — `SallyStrip`→`SallyChat`→`SallyMessage`+`RichCardRenderer` (kept as **pluggable registry**, card catalog stripped), `SallyInput`, `store.ts` (raw `fetch()` POST + manual SSE parse, handles AI-SDK v6 + legacy numeric frames). Mounted via `SallyGlobalProvider` (rename) or inline embed.

Result: working multi-tenant streaming chat (Mastra + Anthropic/Gateway, Langfuse, moderation, budget, RLS, HITL).

### Empty-but-extensible MCP toolset
**Lives in `domains/ai/mcp/mcp-tools.module.ts`** — the single most important file to empty:
- Keep `McpModule.forRoot({name, mcpEndpoint:'_internal/mcp'})` + `McpToolService` + sample re-scoped `HealthTool`.
- Empty `imports[]` (~25 domain modules) and `providers[]` (~60 trucking tools).
- Add comment: **"Register your `@Tool` + `@RequiresScope` providers in `providers[]` here."**

The external MCP server (`domains/ai/mcp-server/**`) is kept unchanged: `POST /api/v1/mcp` (OAuth) + `/mcp/apikey` (API-key), per-request stateless `@modelcontextprotocol/sdk` Server. At `onApplicationBootstrap`, `ScopeRegistryService` walks the empty registry → logs empty → `tools/list` returns `[]`; OAuth/pipeline/HITL/audit/rate-limit all still work. **One registry feeds two surfaces** (external MCP server + in-chat `McpToolService`). Desk responsibilities and the toolset must be emptied together (Desk execute-steps fail-closed on unknown tools).

---

## 8. Prisma starter schema

### Kept models/enums (~35 models)
Tenant (slimmed), User (slimmed), `UserRole`/`TenantStatus`/`TenantPlan` (genericized), RefreshToken, LoginEvent (+`LoginEventStatus`/`LoginFailReason`), ApiKey, SuperAdminPreferences, UserInvitation (+`InvitationStatus`/`InvitationChannel`), UserPreferences, Notification (+`NotificationChannel`/`Category`/`Status`, genericized `NotificationType`), PushSubscription, FeatureFlag, Feedback (+`FeedbackStatus`), SupportTicket+SupportTicketMessage, Announcement (+enums), Document (generic file store), OAuthClient/AuthorizationCode/AccessToken/RefreshToken, WebhookSubscription+WebhookDeliveryLog, DomainEventLog, DeadLetterLog, Job (+`JobStatus`)+JobSchedule, TenantCounter, TenantJobRun, ProcessedBillingEvent, billing primitives (BillingCustomer/Subscription/Invoice/PaymentMethod/Wallet/WalletTransaction + enums), PlanConfig/PlanEntitlement/TenantPlanEvent, AddOn/TenantAddOn/TenantAddOnEvent/AddOnRequest (+enums), IntegrationConfig/VendorConfig/IntegrationExternalEntity/IntegrationEntityMapping (framework, trimmed vendor enum), Conversation/ConversationSession/ConversationMessage, KnowledgeDocument, AiInvocation/ModelPricing/TenantAiBudget, AgentInvocationLog, HitlChallenge. **Desk models (DeskAgent/Responsibility/Episode/EpisodeStep/Approval/Memory/EntitySuppression + 8 enums) OPTIONAL** — keep gutted if shipping the agent framework.

### Severed relations (compile-blocking — must remove or `prisma validate` fails)
- **Tenant:** delete `dotNumber`, `mcNumber`, `carrierType`+enum, `fleetSize`+enum, `fleetLimitWarning`, `defaultFactoringCompanyId`+relation, `bundleFormat`+enum, `driverPayTiming`+enum, and all ~40 trucking relation arrays (lines 269-359).
- **User:** delete `driver`/`driverId`, `customer`/`customerId` (392-397) + domain back-relation arrays (423-467). Genericize `UserRole` (drop DISPATCHER/DRIVER/CUSTOMER; keep OWNER/ADMIN/SUPER_ADMIN, add MEMBER).
- **Conversation:** sever `driverId`. **ConversationMessage:** sever `loadId` (3062-3063).
- **UserInvitation:** sever `driverId` (600-601) + `customerId` (604-605).
- **Document:** sever `moneyCode`, `driverActionRequest`, `relatedStopId`.
- **NotificationType enum:** keep platform values (USER_INVITATION, TENANT_*, USER_JOINED, ROLE_CHANGED, SETTINGS_UPDATED, INTEGRATION_SYNC_*); drop trucking (INVOICE_*, SETTLEMENT_*, DRIVER_*, CUSTOMER_*, SHIELD_*, EMAIL_RATECON_PARSED) — or convert to free String.
- **AiSurface enum:** drop DOC_RATECON/DOC_FUEL_RECEIPT/ALERT_BRIEFING; keep CHAT/DESK_STEP/EMBEDDING/KB_INGEST/MEMORY_EXTRACT.
- **PlanConfig/TenantPlan:** keep models; rename seed display names (Haul/Fleet/Freight-Force) + `unitLabel` default `truck/month`.
- **IntegrationType/IntegrationVendor enums:** trim to generic + QuickBooks (drop TMS/ELD/load-board/Samsara/Motive/McLeod).
- Remove `CustomFieldDefinition`, `ReferenceData` and their Tenant relations (or genericize `CustomFieldEntityType`).

### Migration strategy
**Ship ONE fresh `0_init` migration** (`prisma migrate dev --name init` from the pruned schema), NOT the 276-file history — ~90% of which mutates domain tables, embeds domain pgvector/partial-unique raw SQL, and contains Sally data backfills. The fresh init **must hand-add the raw-SQL** for the KEPT `Unsupported(...)` columns: `CREATE EXTENSION IF NOT EXISTS vector;`, KnowledgeDocument `embedding vector(1536)` + `content_tsv tsvector` GIN/ivfflat indexes (and DeskMemory `contentEmbedding` if Desk kept). Preserve the dual ID convention: business entities use `id Int autoincrement` + opaque string business key; audit/event/log tables use `id String @db.Uuid` (no `@default` — app passes `generateUuidV7()`).

### Seeds
**Keep:** 01-super-admin (genericize `admin@sally.com`), 02-feature-flags (table; replace flag rows — only `api_keys`/`webhooks`/`oauth_clients`/`login_activity`/`ai_chat`/`voice_mode` are generic), 07-plan-config + 08-plan-entitlements (genericize tier names + unit), 10-vendor-configs (trim), 12-add-ons (replace EDI rows), 13-desk (only if Desk kept, gut trucking agents), 14-model-pricing. **Drop:** 03-truck-stops, 06-reference-data, 09-migrate-existing-tenants (one-off), 11-fuel-card-types, ifta-tax-rates.ts. `scripts/demo/` (domain demo seeder) is already separate from the prisma seed path — delete.

---

## 9. shared-types + Zod codegen pattern (preserve domain-free)

**Reality check:** it is **Zod v3** (`^3.24.2` in shared-types, backend, web) — the brief's "Zod v4" is not the current state; treat any v4 upgrade as separate work.

**The pattern (all reusable, carry over):**
1. Every API/entity contract is a `z.object` + co-located `z.infer` export, **camelCase fields** (CLAUDE.md non-negotiable), grouped by folder, re-exported through one `src/index.ts` barrel consumed as `@app/shared-types`.
2. **Enums have ONE source of truth = Prisma enums** in `apps/backend/prisma/schema.prisma`. `apps/backend/scripts/generate-shared-enums.ts` regex-parses every `enum X {}` block → emits `packages/shared-types/src/generated/prisma-enums.ts` as the schema+type+value-bag triple (`XSchema = z.enum([...]); type X = z.infer<...>; const X = XSchema.enum;`). Chained into `pnpm prisma:generate`, guarded by `enum-codegen-parity.spec.ts` (regenerate + fail on diff). Backend imports from `@prisma/client`; frontend/shared-types import the generated mirror — structurally identical.
3. **Agent-scope model** (`src/ai/agent-scopes.schema.ts`): scopes shaped `domain:action[:sensitive|:bulk]` with `SCOPE_DESCRIPTIONS`/HITL-tiers/`NEVER_EXTERNAL_SCOPES` + `scopeDomain/scopeAction/scopeTier` helpers — a reusable agent-authz model (regenerate the scope strings per app).

**To keep domain-free:** carry the **mechanism** (`generate-shared-enums.ts` script + parity spec + barrel + `z.object`/`z.infer` convention); **do NOT carry** the generated `prisma-enums.ts` (regenerates from new schema) or the domain schema folders (fleet/financials/routing/operations/desk/integrations/api/enums/ifta — all stripped). Keep `src/platform/*`, `src/constants/pagination`, `src/utils/{format,time}`, `src/infrastructure/{job-envelope,sse-events,webhook}`, `src/ai/{spend,telemetry,capability,model-alias,agent-activity,agent-scopes(regen vocab)}`. Carve a generic subset for the 6 foundation web files that import shared-types (auth roles, conversation DTOs, an `SseEvent` envelope shape, `Preferences`, entitlement primitives).

---

## 10. Infra / tools / CI parameterization

Every Sally-name-hardcoded thing → template variable / `__PROJECT__` token / `.example` placeholder:

**Terraform** (`var.project` already defaults to `sally` — set default neutral, e.g. `app`):
- `main.tf` line 14 — S3 backend `bucket = "sally-terraform-state"` (TF backends can't use vars → use `-backend-config` or a `__PROJECT__-terraform-state` find/replace token).
- `bootstrap/main.tf` — bucket `sally-terraform-state` + Project tag `sally`. **Exclude committed `terraform.tfstate` + `.terraform/`.**
- `ecr.tf` lines 16/23/47 — `sally-ecr-backend` → `${local.prefix}-ecr-backend`.
- `cloudwatch.tf` — `/sally/${var.env}/api|worker` → `/${var.project}/...`.
- `rds.tf` — master username `sally_user`; secret name `sally-staging-secret-db-url` → parameterize.
- `iam.tf` lines 248-249 — state-bucket ARNs `arn:aws:s3:::sally-terraform-state` → templatize.
