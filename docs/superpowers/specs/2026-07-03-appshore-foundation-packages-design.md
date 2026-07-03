# AppShore Foundation Packages — Design Spec (app-foundation refactor)

- **Date:** 2026-07-03
- **Author:** Enterprise Architect (Claude) + Ajay
- **Status:** Approved (Ajay delegated approval: "if you agree, take reference of these docs and refactor")
- **Reference (governing prior art):** Sally worktree specs
  - `2026-06-25-appshore-platform-kernel-extraction.md` (design)
  - `2026-06-26-appshore-layer-classification-map.md` (layer map)

---

## 1. Goal

Re-shape **app-foundation** so the reusable cross-cutting foundation lives in **`@appshore/*` packages**
under `packages/appshore/`, and `apps/*` are thin product shells. The end goal is unchanged:

> Clone the repo → run `pnpm init-app` → answer a few prompts (name, display name, multi-tenant or
> single-tenant, include mobile app?) → you have a working backend + web app (+ Flutter mobile app)
> with auth, tenancy, billing, AI, jobs, and observability on day one. You only add domain code.

Additionally: ship a **Flutter companion app at `apps/mobile`** (role-named, like `web`/`console`).

**Hard constraint (inherited from the Sally spec):** behavior-preserving. Build, type-check, and the
full test suite must be green after every phase, matching the recorded baseline.

## 2. Why this is easier here than in Sally

app-foundation is Sally _minus the domain_. The Sally effort's biggest phase — relocating 74
DOMAIN_COUPLED files into domains — is **zero work here** (there is no Driver/Load). The layer test
from the classification map applies directly:

1. Product-agnostic and DB-free? → `@appshore/kernel`
2. Product-agnostic but touches Prisma/Redis/tenancy? → `@appshore/platform`
3. Composition glue for _this_ app? → stays in `apps/backend` (shell)

## 3. Target architecture

```
packages/
  foundation/                     ← the AppShore platform (never renamed by init-app)
    kernel/      @appshore/kernel     DB-free mechanics. No prisma, no redis-bound services.
    db/          @appshore/db         Prisma schema (multi-file), client generation, migrations,
                                      seeds, enum codegen. THE single Prisma client for the repo.
    platform/    @appshore/platform   Prisma-coupled SaaS foundation: auth, tenancy, queue/cache/
                                      storage/notification/push/sms/sse/events persistence, health,
                                      platform domains (users, tenants, plans, flags, api-keys,
                                      oauth-provider, settings, onboarding, …).
    web-core/    @appshore/web-core   Web foundation: api client, auth stores/providers, realtime,
                                      shared hooks/components/config (source-consumed, like @app/ui).
  ui/            @app/ui              (unchanged — app-scoped, themable per product)
  shared-types/  @app/shared-types    (unchanged)
  test-utils/    @app/test-utils      (unchanged)
apps/
  backend/       domains/{ai,desk,prompting,billing,notifications,support,admin,integrations}
                 + app shell (app.module, main, worker, config, dev) + architecture guardrails
  web/           app routes + features (thin, imports @appshore/web-core + @app/ui)
  console/       unchanged this pass (documented follow-up: consume web-core)
  mobile/        Flutter companion app (NEW)
```

**Dependency direction (enforced by guardrail tests):**
`kernel ← db ← platform ← apps` and `kernel ← web-core ← web`. No package imports app code.

### 3.1 Package consumption model

- `kernel`, `db`, `platform`: **compiled packages** (tsc → `dist/`, the `@app/shared-types`
  pattern), with `exports` + `typesVersions` so deep imports work
  (`@appshore/platform/auth/guards/jwt-auth.guard`). Turbo orders builds.
- `web-core`: **source package** (the `@app/ui` pattern) — Next.js transpiles it.

### 3.2 The Prisma decision (resolves the Sally Phase-4 crux)

Sally's spec flagged the injected-generic-client problem (675 importers). For a _template_ monorepo
the clean, ecosystem-standard answer is a **database package**: `@appshore/db` owns
`prisma/schema/` (multi-file: `foundation.prisma` = all 68 foundation models + `app.prisma` = your
extension point), `prisma.config.ts`, migrations, seeds, and the generated client. Both
`@appshore/platform` and `apps/backend` import the same client from `@appshore/db`. One client, one
engine, no type drift, no injection ceremony. (If foundation packages are ever published to npm,
the Sally injected-client design is the recorded migration path.)

### 3.3 What deliberately stays in `apps/backend` (mirrors the Sally map)

- `domains/ai`, `domains/desk`, `domains/prompting` (254 files) — the **`@appshore/ai-core` zone**,
  explicitly deferred in the Sally spec (highest coupling; 56 forwardRefs there). Documented as the
  next initiative.
- `domains/{billing,notifications,support,admin,integrations}` — foundation _domains_ delivered as
  in-app modules, same treatment Sally gave its domains. They are extension surfaces (vendor
  registry, notification channels) and are expected to be edited by the product team.
- App shell: `app.module.ts`, `main.ts`, `worker.ts`, `config/`, `dev/`, queue topology wiring.

## 4. Flutter companion app (`apps/mobile`)

Role-named `mobile` (consistent with `web`/`console` — named by role, not tech). Minimal but real:

- `lib/core/` — API client (dio), env config (API base URL), theming matching the foundation brand.
- Screens: status/home (calls backend `/health`), login scaffold (backend JWT auth), settings stub.
- `init-app` renames the display title and optionally drops the app (`--mobile no`).
- Gate: `flutter analyze`, `flutter test`, `flutter build web` all green; app visually verified.

## 5. init-app upgrades

Existing prompts stay (name, display-name, scope, db, tenancy mt/st). New:

- `--mobile yes|no` — include or delete `apps/mobile`; renames pubspec/app title when kept.
- `@appshore/*` scope and `packages/appshore/` are **never renamed** — they are the platform brand.
- Rename rules extended to cover new package paths.

## 6. Phased execution (each phase gated on green)

- **P0** Scaffold packages + turbo wiring (no behavior change).
- **P1** `@appshore/db` — move prisma out of the backend; multi-file schema split.
- **P2** `@appshore/kernel` — DB-free mechanics + repo-wide import codemod.
- **P3** `@appshore/platform` — auth/infrastructure/shared/health + `domains/platform` + codemod.
- **P4** `@appshore/web-core` — web `shared/` + `lib/` + codemod.
- **P5** `apps/mobile` Flutter app.
- **P6** init-app + docs + architecture guardrails (kernel purity, one-way deps).
- **P7** Full verification: suite green, web running + screenshot, Flutter running + screenshot.

Verification gate per phase: `pnpm build` (turbo) + backend jest suite vs. baseline + affected app
builds. No success claims without command output.

## 7. Risks & mitigations

| Risk                                                                       | Mitigation                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Class-identity / DI breakage across packages (duplicate @nestjs instances) | packages declare nest/prisma as peerDependencies; single workspace version; runtime smoke boot |
| Import rewrite at scale (~600 files)                                       | deterministic codemod script (resolve relative import → new specifier), not hand edits         |
| Barrel-file circular imports in Nest                                       | deep subpath imports preserved 1:1; no giant barrels                                           |
| Prisma move breaks scripts/CI/docker                                       | grep-driven audit of every `prisma` reference; migrate status + generate as gate               |
| Nested jest configs drift                                                  | per-package jest configs cloned from backend's; suite counts compared to baseline              |
| Kernel secretly DB-coupled                                                 | kernel builds standalone with no prisma/redis-bound deps; guardrail spec enforces              |

## 8. Definition of done

- `@appshore/{kernel,db,platform,web-core}` exist, build, and are consumed by the apps.
- Backend `src/` contains only domains + shell (no `infrastructure/`, `auth/`, `shared/`, `health/`).
- Full suite green at or above baseline; web and mobile visually verified running.
- `pnpm init-app` scaffolds with the new prompts (verified via `--dry-run`).
- CLAUDE.md / README / guardrail specs updated to the new map.
