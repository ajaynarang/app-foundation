---
name: dev-docs
description: Refresh this repo's developer documentation (README.md, docs/, CLAUDE.md cross-references) against the codebase. Use when the docs have drifted from the code, when shipping a change large enough that the docs need an update, or for a scheduled audit. Invoke with "refresh dev docs", "update developer docs", or "the docs are stale".
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
---

# Developer-Docs Refresh

You are the senior maintainer of this repo's developer documentation: the root `README.md`, the `docs/` directory, and the doc-facing parts of `CLAUDE.md`. Your job is to keep them 100% correct against the codebase and the canonical conventions.

**Command:** $ARGUMENTS

## What this skill is for

- A scheduled or ad-hoc refresh of the developer docs.
- A targeted update after a major change (new domain, new convention, infra swap, vocabulary change, etc.).
- Bringing the docs back to 100% correctness when drift is observed.

## What this skill is NOT for

- Design docs and implementation plans under `docs/plans/` — those are project artifacts owned by the `brainstorm`/`plan` skills.
- Code comments and API (Swagger) docs — those live with the code.

## The verification rule (load-bearing)

**Every concrete claim in the docs MUST be backed by a source file you read in this refresh session.** Concrete claims include: ports, paths, script names, package names, module names, env var names, command names, model names, branch rules, workflow names.

**Convention claims** (camelCase, sheet-vs-dialog, dark theme, enum sourcing, etc.) MAY cite the pattern skills (`backend-patterns`, `frontend-patterns`) and CLAUDE.md.

If a fact cannot be verified from source, **omit the claim or mark it with `TODO(verify)`** that blocks PR merge.

## The workflow (six phases)

### Phase 0 — Worktree isolation

Always work in a separate worktree branched from the default branch:

```bash
git fetch origin main
git worktree add -b docs/dev-docs-refresh-<YYYY-MM> .worktrees/dev-docs origin/main
cd .worktrees/dev-docs
```

The main checkout stays untouched.

### Phase 1 — Ground-truth audit ledger

Before changing any doc page, produce `docs/plans/<YYYY-MM-DD>-dev-docs-refresh-audit.md`. The ledger records every concrete fact the rewritten docs will cite, with the source file pinned. Sections:

- **A. Repo-wide facts** — apps, packages, root scripts, CI workflows, tooling versions.
- **B. Getting Started** — docker-compose services/ports, env setup, seed credentials, first-run flow.
- **C. Architecture** — backend domains, platform-glue composition, `@appshore/*` package boundaries, frontend features/routes, Prisma models, AI stack, observability, Desk vocabulary, tenancy modes.
- **D. Backend Guide** — module pattern, endpoint scaffolding, migration scripts, DomainEvent, BullMQ topology, test patterns.
- **E. Frontend Guide** — App Router layout, feature modules, TanStack Query, Zustand, shadcn/`@app/ui` primitives, FormSheet, toasts, loading layers.
- **F. Conventions** — camelCase, domain enums, theme tokens.
- **G. QA** — `tests/` layout, `pnpm test:*` catalog, env vars, report locations.
- **H. Contributing** — branch model, PR rules, review workflow, gate policy.

Surface the ledger to the user for a quick scan before writing any prose. Wait for acknowledgement. The ledger catches cascade-risk errors at the source.

### Phase 2 — Rewrite by section

One commit per section. Order chosen to minimize blast radius (most-cited content first):

1. **Conventions** — smallest, sharpest, most-cited.
2. **Getting Started / Quick start** — highest-traffic, most concrete claims.
3. **Architecture** — biggest rewrite.
4. **Backend guide** — leans on the `backend-patterns` skill for conventions, source for concrete claims.
5. **Frontend guide** — leans on the `frontend-patterns` skill for conventions, source for concrete claims.
6. **QA** — leans on the `qa` skill + `tests/`.
7. **Contributing** — depends on everything above being correct. Last.

After each section: verify internal links resolve and code blocks are runnable as written (or explicitly marked illustrative). Conventional Commits subject lines (`docs(<scope>): ...`).

### Phase 3 — Verification pass

Walk every changed page top to bottom:

- Run every quoted command in a scratch shell where safe (`pnpm --filter ... --help`-level verification is fine for destructive ones).
- `grep` every path claim against the repo.
- Check every cross-link.

No claim is "verified" until it has been checked this session.

### Phase 4 — Self-review with rating

Score the rewrite against this rubric (each out of 10):

1. **Factual correctness** — every concrete claim traces to a source file read this session.
2. **Convention fidelity** — every NON-NEGOTIABLE in CLAUDE.md is reflected; nothing contradicts the pattern skills.
3. **Coherence** — sections don't contradict each other; cross-links work.
4. **Audience fit** — a new engineer, an experienced contributor, and an external evaluator are all served.
5. **Completeness vs. scope** — every planned section filled; nothing out-of-scope.
6. **Code-block quality** — runnable as written, or explicitly illustrative.
7. **Maintainability** — the next refresh is a 1-day job.
8. **Tone** — thoughtful engineer, direct, no filler.

**Overall rating = min(axis scores).** A single weak axis caps the rating, intentionally — that's the "100% correct" bar.

Write the self-review to `docs/plans/<YYYY-MM-DD>-dev-docs-refresh-self-review.md`. If the overall is below 9, fix the cheap blockers before opening the PR.

### Phase 5 — PR + cleanup

```bash
git push -u origin docs/dev-docs-refresh-<YYYY-MM>
gh pr create --title "docs: <month> developer docs refresh" --body-file <pr-body.md>
```

The PR body is the per-page change list. After merge:

```bash
cd <main-checkout>
git worktree remove .worktrees/dev-docs
git branch -d docs/dev-docs-refresh-<YYYY-MM>
```

## Things to always check on every refresh

These are the items that drift fastest:

- **Backend domain list** (`apps/backend/src/domains/`) vs what the docs and CLAUDE.md claim.
- **Frontend feature/route tree** (`apps/web/src/features/`, `apps/web/src/app/`).
- **Root `package.json` scripts** — the `pnpm <script>` catalog quoted in docs.
- **docker-compose services and ports**.
- **Quick-start flow** — actually works on a fresh clone (the seeds, the env examples, the dev credentials).
- **Tooling versions** — semver bumps land regularly.
- **Extension-point paths** (event registry, MCP tools module, Desk registry, vendor registry, `app.prisma`) — these are the starter's headline promise; a stale path here is a first-impression bug.

## When you finish

Hand the PR back to the user with a brief summary:

1. PR URL.
2. Overall self-review rating + the specific axes below 10.
3. Confirmation that the audit ledger is committed and reviewable.
4. Next step: user reviews + merges.
