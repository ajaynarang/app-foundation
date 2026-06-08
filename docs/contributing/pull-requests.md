---
title: Pull Requests
description: PR rules — target develop, squash merge, conventional commits, the gate model (mostly manual), the description template.
---

# Pull Requests

What follows is the rule set. For the full first-time walkthrough, see [Getting Started → Your First PR](../getting-started/first-pr.md).

## Targeting

- PRs target **`develop`**. Never `main` directly.
- Production releases go through a separate PR: `develop` → `main`, gated by environment Required Reviewers.
- Squash merge is expected. The PR title becomes the squash-merge commit subject — write it well.

## Branch names

| Pattern | Use for |
|---|---|
| `feat/<scope>` | New features |
| `fix/<scope>` | Bug fixes |
| `docs/<scope>` | Documentation only |
| `refactor/<scope>` | Refactors with no behavior change |
| `chore/<scope>` | Dependencies, config, tooling |
| `skill/<name>` | New Claude skill under `.claude/skills/` |
| `perf/<scope>` | Performance work with benchmarks |
| `ci/<scope>` | CI / workflows |
| `test/<scope>` | Adding or updating tests |

## Commit messages

Conventional Commits format:

```
<type>(<scope>): <subject>

<body — optional, explains the WHY>

<footer — optional, e.g. Closes #123>
```

Examples from the recent history:

```
feat(messaging): formatLoadLabel, driver context labels, @-picker keyboard nav
fix(billing): surface load PO/referenceNumber on invoice list + sheet
docs(document-intelligence): spec — fix rate-con ghost cards stuck in processing
feat(loads): add revert-preview endpoint for dispatcher rewind
```

Keep subjects under 72 chars, lowercase, imperative ("add" not "added"). Use a body when the "why" isn't obvious from the diff.

## Pre-merge local checks

Run before pushing. There is no automatic CI gate (see below), so these are what stops broken code from landing.

```bash
pnpm format:check
pnpm lint
pnpm type-check
pnpm test         # backend Jest (web is a no-op)
pnpm build        # all apps build clean
```

If you skip them, broken code lands on `develop` and shows up in staging the next time someone clicks Deploy.

## PR description template

```markdown
## Summary

One paragraph: what this changes, why, how to think about it.

## Verification

How a reviewer can verify locally:
- Start the stack: `docker-compose up -d && pnpm dev:side`
- Open `http://localhost:3001/dispatcher/loads`
- (concrete steps)

## Risk / scope

What this touches; what it doesn't; what could break.

## Screenshots

Drop relevant ones from `.screenshots/` (gitignored) if there's UI work.

## Refs

- Spec / plan: `.docs/plans/2026-05-XX-<topic>.md`
- Issue: <link if any>
```

## The gate model

There is no automatic CI gating PRs in this repo right now. **This is the truth, not a bug to work around.**

- `ci.yml` is `workflow_dispatch` only. The header comment claims otherwise; the comment is stale.
- `quality-gate.yml` (Playwright suite against staging) is also `workflow_dispatch` only.
- `deploy-all.yml`, `deploy-frontend.yml`, `docs.yml` — all `workflow_dispatch` only. Vercel git auto-deploy is disabled.

What gates a merge:

1. **Local checks** before push.
2. **Reviewer judgment** — code, design, conventions, tests, accessibility.
3. **Optional `Quality Gate` run** for risky changes. The reviewer triggers it from the Actions tab and inspects the result.

This model works because the team takes the local checks seriously. Don't outsource the work to a CI that isn't running.

## Review etiquette

Before requesting human review:

- Push the latest commit.
- Self-review the diff in the GitHub UI — you'll find things you missed.
- Run `/sally-review` in Claude Code on the branch. It applies SALLY conventions and surfaces likely review comments. See [Code Review](review.md).
- Address every `/sally-review` finding (or write a short explanation in a PR comment if you disagree).

When responding to review comments:

- Address every comment, even if just to acknowledge.
- Push fixes in additional commits — don't force-push during active review.
- Use GitHub's "Resolve conversation" for each thread once the reviewer's concern is satisfied.
- For substantive disagreements, push back in writing rather than capitulating silently. The point is to land the right answer, not to make the reviewer happy.

## After merge

- The branch is automatically deleted on merge if the repo setting is on; otherwise `git push origin --delete <branch>`.
- `develop` does **not** auto-deploy to staging. To deploy your change:
  - Actions → **Deploy All** (or **Deploy Frontend** for web/console only) → Run workflow → environment: `staging`.
  - Verify on staging once the workflow finishes.

## Production releases

`develop` → `main` PR:

1. Open PR from `develop` to `main`.
2. Get approvals per repo policy (CODEOWNERS + release reviewers).
3. Merge.
4. Actions → **Deploy All** → environment: `production` → Run workflow. Required Reviewers on the production environment must approve before the deploy runs.

Production deploys are intentional and slow. They are not the place to discover that local checks were skipped.

## Common review comments

The ones we comment on most often:

| Comment | Fix |
|---|---|
| "This emits a plain object — wrap in `new DomainEvent(...)`." | [Backend → Events & Queues](../backend/events-queues.md) |
| "Missing `showError()` on this mutation." | [Frontend → UI Standards](../standards/frontend.md#l3-toasts-on-every-mutation) |
| "Use `<Skeleton>` not a spinner here." | [Frontend → UI Standards](../standards/frontend.md#l4-skeleton-not-spinner-not-null) |
| "This `bg-white` needs a dark variant." | [Standards → Colors](../standards/platform.md#color-palette-semantic-tokens-only) |
| "Use the centralized `queryKeys` factory, not a local constant." | [Frontend → State Management](../frontend/state-management.md#query-keys-come-from-the-central-factory) |
| "Form has 5 fields — should be a Sheet, not a Dialog." | [Frontend → UI Standards](../standards/frontend.md#dialog-vs-sheet-vs-alertdialog) |
| "This is using `prisma migrate dev` — use `tools/db/migrate.sh` instead." | [Backend → Database & Prisma](../backend/database-prisma.md#the-one-hard-rule) |
| "Schema field is `String @db.VarChar` for an enum-shaped value — use a Prisma enum." | [Standards → Domain Enums](../standards/platform.md#domain-enums-are-prisma-enums) |
