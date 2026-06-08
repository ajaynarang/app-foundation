# AI Context for SALLY Project

---

## Rule 1 — Wiki-First Lookup (ALWAYS)

The **Obsidian wiki is the primary reference** for any question about architecture, data models, components, decisions, or project state.

**Vault path:** `Obsidian Vault/SALLY/` (repo-relative).

**Lookup flow:**

1. Open `Obsidian Vault/SALLY/index.md` — use the Semantic Lookup table to navigate.
2. Read the relevant `Wiki/` page(s) — they contain full code excerpts and cross-references.
3. **Only if the wiki is insufficient:** fall back to memory files in `/Users/ajay-admin/.claude/projects/-Users-ajay-admin-sally/memory/`.
4. **Only for a targeted edit:** open the actual source file.

**When the wiki is insufficient:** do the work using source as fallback, update memory after, and append a gap note to `Obsidian Vault/SALLY/log.md` (`## [YYYY-MM-DD] gap | <topic> | discovered during <task>`).

**When editing code — mark the wiki page stale:** `grep -rl "source_file: <path>" "Obsidian Vault/SALLY/Wiki/"`, then set `status: stale` in that page's frontmatter. Refreshed on next `/wiki-ingest`.

**Sync chain after memory updates or root-doc changes:** run `./scripts/sync-vault.sh`, then `/wiki-ingest` in the Claude session.

> Tracked vault content: `Wiki/`, `index.md`, `schema.md`, `README.md`. Everything else under the vault (`.obsidian/`, `Sources/`, `Archive/`, `Templates/`, `log.md`) is local-only.

---

## What is SALLY

SALLY is an **AI-native fleet operations platform**. Core TMS (drivers, vehicles, loads, invoicing, settlements, close-out) plus Sally AI assistant with 20+ MCP tools, document intelligence (rate-con parsing), Shield compliance engine, command center, route planning with HOS compliance, and integrations (Samsara, QuickBooks).

**Roles:** DISPATCHER, DRIVER, ADMIN, CUSTOMER, SUPER_ADMIN

---

## Monorepo Structure

```
apps/
  backend/      — NestJS 11 API (TypeScript, Prisma 7.3, PostgreSQL 16, Redis 7)
  web/          — Next.js 15 frontend (App Router, Tailwind, Shadcn/ui, TanStack Query)
  console/      — SALLY Console (Next.js 15) — platform management hub, API docs, settings
  studio/       — Remotion video rendering (marketing)
packages/
  ui/           — Shared Shadcn UI components, theme, utilities (@sally/ui)
  shared-types/ — Shared Zod schemas and TypeScript types
infra/
  terraform/    — AWS infrastructure (ECS, S3, etc.)
```

**Package manager:** pnpm | **Monorepo tool:** Turborepo

### Backend Domains (`apps/backend/src/domains/`)

| Domain               | What it does                                                           |
| -------------------- | ---------------------------------------------------------------------- |
| `fleet/`             | Drivers, vehicles, loads, customers, documents, recurring lanes        |
| `financials/`        | Invoicing, settlements, payments, close-out, profitability             |
| `operations/`        | Alerts, command center, shield (compliance), monitoring, notifications |
| `integrations/`      | Samsara, QuickBooks, OAuth, sync engine, vendor adapters               |
| `ai/`                | Sally AI chat, document intelligence, knowledge base, MCP, moderation  |
| `routing/`           | Route planning, HOS compliance                                         |
| `platform/`          | Users, tenants, feature flags, settings, onboarding, API keys, plans   |
| `platform-services/` | Fuel cards, fuel prices, geocoding, mileage, tolls, traffic, weather   |
| `admin/`             | Admin jobs and scheduled tasks                                         |

### Frontend App Routes (`apps/web/src/app/`)

- `/dispatcher/` — Main TMS dashboard (loads, fleet, billing, pay, alerts, command-center, shield, close-out, plans)
- `/driver/` — Driver mobile view · `/customer/` — Customer portal · `/(super-admin)/` — Platform admin · `/admin/` — Tenant admin

---

## Technology Stack

| Layer    | Tech                                                                             |
| -------- | -------------------------------------------------------------------------------- |
| Backend  | NestJS 11, TypeScript 5.9, Prisma 7.3, PostgreSQL 16 (pgvector), Redis 7, BullMQ |
| Frontend | Next.js 15, TypeScript, Tailwind CSS, Shadcn/ui, TanStack Query, Zustand         |
| Auth     | Firebase Authentication, Twilio for OTP                                          |
| AI       | AI SDK, OpenAI, MCP, Mastra, Vercel AI Gateway                                   |
| Infra    | Docker Compose (dev), AWS ECS + Terraform (prod), Loki + Tempo + Grafana, Vercel |

---

## Development Commands

Secrets are managed by **Doppler** — backend/web/console each `doppler setup` once, then prefix commands with `doppler run --`. Common starting points:

```bash
docker-compose up -d              # PostgreSQL 16 + Redis 7
pnpm doppler:backend              # Start backend with Doppler secrets
pnpm doppler:frontend             # Start frontend with Doppler secrets
pnpm build / pnpm test / pnpm lint   # All apps (Turborepo)
```

Backend DB work runs from `apps/backend/` with `doppler run --` (e.g. `prisma:generate`, `setup:base`, `setup:demo`). **Migrations: use `tools/db/migrate.sh`, never `prisma migrate dev`** (avoids mastra-table drift reset). Full command reference — including the `stg-debug` parallel stack and tenant-reset — is in the `sally-backend-patterns` skill and `DOCUMENTATION.md`.

---

## Git Branching Strategy

- **`develop`** — primary active branch. All feature branches merge here. Auto-deploys to staging.
- **`main`** — SACRED. Production only. Never commit directly, never force push. Only updated via PR from `develop`.
- Feature branches branch from `develop`, merge to `develop` via PR.

> CRITICAL: `main` = production. Always branch from `develop`, never from `main`. Always work via a feature branch + PR — never push directly to `develop`.

---

## Code Conventions

### camelCase Convention (NON-NEGOTIABLE)

All API response objects, request bodies, DTOs, service params, and frontend types use **camelCase exclusively**.

**Exceptions** (snake_case is correct): Prisma `where:` / `data:` / `select:` / `include:` / `orderBy:` blocks (match DB columns); the `@Query('snake_case')` decorator argument (URL param name) — but the TS variable must still be camelCase.

### Domain Enums (NON-NEGOTIABLE)

**All domain enums** (status, role, type, priority, severity, category, etc.) are Prisma enums in `apps/backend/prisma/schema.prisma` — one source of truth. Backend imports the typed enum from `@prisma/client`; frontend imports the auto-generated mirror from `@sally/shared-types`. Never hand-edit `packages/shared-types/src/generated/prisma-enums.ts`, never use a `String @db.VarChar` column for an enum-shaped field, never hand-write `'UPPER_LITERAL'` next to an enum field.

> Full reference — adding values, adding new enums, the four CI guardrails, out-of-scope lowercase cases — is in the **`sally-backend-patterns` skill, §6.4**.

### Documentation Organization

- AI-generated plans → `.docs/plans/` (dated: `YYYY-MM-DD-topic.md`)
- Product specs → `.docs/specs/` · Technical docs → `.docs/technical/`
- Root directory → only `README.md`, `CLAUDE.md`, `DOCUMENTATION.md`

> The `sally-backend-patterns` and `sally-frontend-patterns` skills are the canonical reference for all backend/frontend implementation conventions (modules, services, DTOs, hooks, sheets, tables, caching, events, queues). Consult them before implementing.

---

## CRITICAL: UI Development Standards (MUST FOLLOW)

### Dark Theme (NON-NEGOTIABLE)

| Element     | NEVER                                       | ALWAYS                                                    |
| ----------- | ------------------------------------------- | --------------------------------------------------------- |
| Backgrounds | `bg-white`, `bg-gray-50` standalone         | `bg-background`, `bg-card`, `bg-gray-50 dark:bg-gray-900` |
| Text        | `text-gray-900`, `text-gray-600` standalone | `text-foreground`, `text-muted-foreground`                |
| Borders     | `border-gray-200` standalone                | `border-border`                                           |
| Hover       | `hover:bg-gray-100` standalone              | `hover:bg-gray-100 dark:hover:bg-gray-800`                |

**Colors:** Only black, white, gray. Status indicators (red/yellow/green/blue) allowed with dark variants.

### Responsive Design (NON-NEGOTIABLE)

Mobile-first. Test at 375px, 768px, 1440px in both themes. Min touch target: 44x44px.

### Shadcn UI Components (NON-NEGOTIABLE)

**ALWAYS use Shadcn components.** Never use plain `<button>`, `<input>`, `<select>`, `<table>`, `<label>`, etc. Import from `@/components/ui/*`. Install missing: `npx shadcn@latest add [name]`.

### Dialog vs Sheet (NON-NEGOTIABLE)

- **Sheet** = create, edit, or detail views (4+ fields). Use `FormSheet` from `@/shared/components/ui/form-sheet`.
  - Edit/Create: block outside click (`onInteractOutside`); Escape/X/Cancel close. View-only: everything closes.
  - Auto-focus first input, Cmd+Enter to submit.
- **Dialog** = quick actions only (1-4 fields), invites, file uploads.
- **AlertDialog** = destructive confirmations only (delete, discard, revoke).

### Loading & Feedback (NON-NEGOTIABLE)

| Layer          | What               | When               | How                                                       |
| -------------- | ------------------ | ------------------ | --------------------------------------------------------- |
| L1: Top Bar    | 2px progress bar   | Route transitions  | `BProgress` in layout                                     |
| L2: Button     | Spinner in button  | Mutations          | `<Button loading={isPending}>` (NOT manual Loader2)       |
| L3: Toast      | Success + error    | Every mutation     | `showSuccess()` / `showError()` from `@/shared/lib/toast` |
| L4: Skeleton   | Shaped placeholder | `isLoading` states | `<Skeleton>` matching layout (NOT spinner, NOT null)      |
| L5: Optimistic | Instant UI update  | Low-risk toggles   | TanStack Query `onMutate` cache update                    |

**Rules:** every mutation MUST have both `showSuccess()` and `showError()` toasts; Sheets showing list data must derive from query cache via `useMemo` (not stale state); list-to-detail transitions prefetch on hover with `queryClient.prefetchQuery()`.

### UI Code Review Checklist

- [ ] All interactive elements use Shadcn components
- [ ] No standalone light-only colors (always include dark variant)
- [ ] Forms 4+ fields use Sheet, not Dialog
- [ ] Every mutation has success + error toasts
- [ ] Every `isLoading` shows Skeleton (not spinner, not null)
- [ ] Button loading uses `loading` prop (not manual Loader2)
- [ ] Responsive classes for all breakpoints

---

## Official Contact Emails (NON-NEGOTIABLE)

All on **@appshore.in** (Hostinger). Never use @sally.app or @sally.ai. Key addresses: `legal@`, `support@`, `security@`, `hello@`, `sally@`, `careers@`, `info@`, plus `sally-support@` for backend transactional sender.

> Full address-to-purpose table is in memory file `reference_email_addresses.md`.

---

## Testing & QA

### Screenshots — Scratch Folder (NON-NEGOTIABLE)

**Every ad-hoc / debugging screenshot — Playwright MCP captures, visual verification shots, anything taken while testing interactively — MUST be saved under `.screenshots/` at the repo root.** Never save a screenshot at the repo root itself.

- `.screenshots/` is gitignored — nothing in it is ever committed. Applies in the base repo AND every git worktree (`.gitignore` is repo-wide): always write to `<repo-or-worktree-root>/.screenshots/`.
- For a Playwright MCP `browser_take_screenshot` call, pass an explicit `filename` like `.screenshots/<name>.png` — do not rely on the default location.
- Does NOT apply to tracked product screenshot assets (`apps/deck/screenshots/`, `packages/screenshots/captured/`) — leave those alone.

### QA Suite

- **Unit tests** — co-located `apps/*/src/**/*.spec.ts` (backend) and `*.test.tsx` (web/console). Run via `pnpm test`. Backend uses TDD; web currently has no unit tests (type-check + build + browser verification are the gates).
- **Integration / E2E / RBAC / smoke / browser** — `tests/` (workspace `@sally/qa`, Playwright). Shared factories/fixtures in `packages/test-utils/` (`@sally/test-utils`).
- Run with `pnpm test:qa:local` (Doppler-injected) or `pnpm test:qa` (bring your own `$API_BASE_URL`). Required env: `TENANT_ID`.

> The **`sally-qa` skill** is the canonical reference for the full test layout, the `pnpm test:*` script catalog, `DEV_AUTH_SECRET` / `DevAuthGuard` auth, the `quality-gate.yml` CI gate, and all `/sally-qa-*` slash commands. Consult it before doing QA work.

---

## Last Updated

May 18, 2026

## Maintained By

SALLY Product & Engineering Team
