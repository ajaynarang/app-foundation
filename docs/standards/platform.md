---
title: Platform Standards
description: Rules that apply everywhere in SALLY — naming, enums, palette, emails, secrets, commits.
---

# Platform Standards

Cross-cutting rules. They apply to backend, frontend, console, tests — every part of the codebase.

## camelCase at the API boundary

**Rule:** all public-facing names — DTOs, request bodies, response objects, frontend types — are `camelCase`.

**The only exceptions** (snake_case is correct):

- Prisma `where:` / `data:` / `select:` / `include:` / `orderBy:` blocks. These match the database column names; Prisma doesn't rename them.
- The `@Query('snake_case')` decorator argument — URL params can be `snake_case`. The TypeScript variable bound to the query must still be `camelCase`.

```ts
// CORRECT — snake_case inside the Prisma block, camelCase everywhere else
const driver = await this.prisma.driver.findFirst({
  where: { tenant_id: tenantId, is_active: true },
  select: { id: true, full_name: true, created_at: true },
});

return {
  id: driver.id,
  fullName: driver.full_name,
  createdAt: driver.created_at.toISOString(),
};
```

```ts
// CORRECT — URL param snake_case; TS variable camelCase
@Get('loads')
findAll(
  @Query('tenant_id') tenantId: string,
  @Query('include_archived') includeArchived: boolean,
) {
  return this.loads.findAll({ tenantId, includeArchived });
}
```

```ts
// WRONG — snake_case in a DTO
export class CreateDriverDto {
  full_name: string;        // should be `fullName`
  phone_number: string;     // should be `phoneNumber`
}
```

**Why:** the camelCase boundary at the controller means consumers (frontend, partner clients, mobile, docs generators) write one less converter and the team agrees on where the boundary is.

## Domain enums are Prisma enums

**Rule:** every domain enum (status, role, type, severity, category, priority) lives in `apps/backend/prisma/schema.prisma`. The frontend imports the auto-generated mirror from `@sally/shared-types`.

```
schema.prisma                                        ← single source of truth
        │
        │ prisma generate (chains generate-shared-enums.ts)
        ▼
@prisma/client (backend)        +    @sally/shared-types/generated/prisma-enums.ts (frontend)
```

**Adding a value:**

1. Add to the enum in `schema.prisma`.
2. From `apps/backend/`: `tools/db/migrate.sh --env local --migrate-only -y` (never `prisma migrate dev` — see [Backend Standards → Migrations](backend.md#migrations-via-toolsdbmigratesh)).
3. `doppler run -- pnpm prisma:generate` regenerates both.
4. `pnpm --filter shared-types build` so consumers see it.

**Four don'ts:**

1. Never hand-edit `packages/shared-types/src/generated/prisma-enums.ts` — it's regenerated and your edit will disappear.
2. Never use `String @db.VarChar` for an enum-shaped field. Add a Prisma enum even if there are only two values today.
3. Never hand-write a literal next to an enum field. `if (status === 'DISPATCHED')` won't update when the enum changes. Import the enum.
4. Never bypass the generator.

**Why:** three places to define an enum (Prisma + Zod + frontend union) drift within a week. One source means rename = global rename, add-a-value = compiler-catches-missing-cases.

The four CI guardrails for this rule are listed in the `sally-backend-patterns` skill at §6.4. One example: `pnpm lint:schema` in `apps/backend/` runs `tsx scripts/lint-schema.ts` and checks for drift.

## Color palette — semantic tokens only

**Rule:** product UI uses the named CSS tokens defined in `packages/ui/src/styles/globals.css`. Never raw Tailwind palette numbers.

The 8 named tokens:

| Token | Role | Light | Dark |
|---|---|---|---|
| `--background`, `--foreground` | Page surface and primary text | white / near-black | near-black / white |
| `--card`, `--card-foreground` | Card surface | white / near-black | dark gray / white |
| `--primary`, `--primary-foreground` | Main actions | near-black | white |
| `--muted`, `--muted-foreground` | Subtle bg, secondary text | light gray / gray | dark gray / lighter gray |
| `--accent`, `--accent-foreground` | Neutral hover (Calendar, Combobox) | light gray | dark gray |
| `--border`, `--input`, `--ring` | Form chrome | gray | dark gray |
| `--info` | Steel blue — links, informational | steel blue | matched |
| `--caution` | Yellow — approaching-limit warning | yellow | matched |
| `--warning` | Orange — needs attention, medium severity | orange | matched |
| `--critical` | Red — safety, destructive, immediate | red | matched |
| `--success` | Green — confirmed, complete, positive | green | matched |
| `--destructive` | Shadcn-standard alias for `--critical` | matches critical | matches critical |

```tsx
// CORRECT — tokens via Tailwind utilities
<Button className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
<span className="text-caution">HOS nearing limit</span>
<span className="text-critical">Payment overdue</span>
<div className="bg-card border border-border text-foreground" />
```

```tsx
// WRONG — raw palette won't theme correctly
<span className="text-green-500">Synced</span>
<button className="bg-red-600 text-white">Delete</button>
```

**Two exceptions:**

- Marketing / deck pages under `apps/deck/` are static HTML and use the brand palette.
- If you genuinely need a color the tokens don't cover: either add a token (and update this page) or use a raw color with explicit light + dark variants (`bg-gray-50 dark:bg-gray-900`).

**Why:** tokens carry semantics and swap correctly between light and dark. Raw palette numbers have to be remembered per usage and break dark mode silently.

## Official emails — `@appshore.in` only

**Rule:** every official SALLY address is on `@appshore.in` (Hostinger). Never `@sally.app` or `@sally.ai`.

| Address | Purpose |
|---|---|
| `legal@appshore.in` | Legal, contracts, DPA, ToS |
| `support@appshore.in` | General customer support |
| `security@appshore.in` | Security disclosures, vulnerability reports |
| `hello@appshore.in` | First-touch / general inquiries |
| `sally@appshore.in` | Brand-voice outbound |
| `careers@appshore.in` | Hiring |
| `info@appshore.in` | Partner / press |
| `sally-support@appshore.in` | Backend transactional sender (`from:` on system emails — invitations, password resets, alerts) |

If you're adding a new sender, use one of the addresses above, or — if you genuinely need a new mailbox — register one on `@appshore.in`. Don't register a new domain.

## Conventional commits

**Rule:** PR commit subject lines follow Conventional Commits.

```
<type>(<scope>): <subject>

<body — optional, explains WHY>

<footer — optional, e.g. Closes #123>
```

Types in use: `feat`, `fix`, `docs`, `refactor`, `chore`, `perf`, `test`, `ci`, `style`, `skill`.

```
feat(loads): add revert-preview endpoint
fix(billing): surface load PO on invoice list
docs(architecture): rename data-flow → runtime-architecture
chore(deps): bump prisma to 7.3.0
skill(sally-dev-docs): add /sally-dev-docs
```

Subjects under 72 chars, lowercase, imperative ("add" not "added"). PRs squash-merge — the PR title becomes the squash commit subject.

## Secrets — Doppler-injected

**Rule:** secrets come from Doppler at runtime. No `.env` files committed; no secrets in code.

- Local dev: `doppler login` once per machine, then `doppler setup` once per app (backend, web, console). Run apps via `pnpm doppler:backend|frontend|console`.
- Staging / production: secrets injected into ECS containers from Doppler via SSM Parameter Store; injected into Vercel projects via the Doppler integration.
- See [Architecture → Secrets Management](../architecture/secrets-management.md) for the full Doppler story.

## Documentation organization

**Rule:** put docs where they belong.

| Where | What goes there |
|---|---|
| `docs/` | This site — published to GitHub Pages. Long-form developer reference. |
| `.docs/plans/` | AI-generated implementation plans, dated `YYYY-MM-DD-<topic>.md`. |
| `.docs/technical/` | Long-form technical notes that don't belong on the public docs site. |
| Repo root | Only `README.md`, `CLAUDE.md`, `DOCUMENTATION.md`. |
| `CLAUDE.md` | Agent-facing rules (where Claude should save screenshots, when to invoke which skill). Not part of the dev docs site. |

## Branch model

**Rule:** branch from `develop`, never from `main`.

- `develop` — primary active branch. PRs target here. Squash merge.
- `main` — production, sacred. Updated only via a `develop → main` release PR.
- Feature branches: `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `refactor/<scope>`, `chore/<scope>`, `skill/<scope>`, `perf/<scope>`, `ci/<scope>`, `test/<scope>`.

Detail: [Contributing → Git Workflow](../contributing/git-workflow.md).

## Review checklist

Run through before requesting human review:

- [ ] camelCase at the boundary (snake_case only in Prisma blocks + `@Query` URL params).
- [ ] Enum values use the imported Prisma enum, not hand-written string literals.
- [ ] Colors via semantic tokens; any raw color has an explicit dark variant.
- [ ] New addresses on `@appshore.in`.
- [ ] Conventional Commit subject.
- [ ] No secrets in code.
- [ ] Doc files in the right place (`docs/` vs `.docs/plans/` vs `.docs/technical/`).
- [ ] Branched from `develop`.
