---
title: Code Review
description: What /sally-review checks, what human reviewers look at, how to respond to comments.
---

# Code Review

Code review at SALLY is two-stage:

1. **Automated first pass — `/sally-review`** in Claude Code applies all SALLY conventions and surfaces likely human-review comments before you request human review.
2. **Human review** picks up from there — design judgment, architectural fit, things `/sally-review` can't see.

This page covers both.

## `/sally-review`

The `/sally-review` slash command (backed by `.claude/skills/sally-review/SKILL.md`) reads the diff on the current branch and applies the SALLY-specific rules. It catches the most common review comments before a human ever sees the PR.

### What it checks

The skill is the authoritative reference. As of May 2026, it covers:

**Frontend (every PR touching `apps/web/` or `apps/console/` or `packages/ui/`):**

- Dark theme — every standalone light color has a dark variant, or uses a semantic token.
- Shadcn-only — no plain `<button>`, `<input>`, `<select>`, `<table>`.
- Dialog vs Sheet vs AlertDialog — Sheet for 4+ fields, AlertDialog for destructive confirmation.
- `FormSheet` usage for create/edit/detail sheets.
- Every mutation has both `showSuccess()` and `showError()`.
- `<Skeleton>` for `isLoading`, not spinner, not `null`.
- Button loading uses the `loading` prop, not manual `<Loader2>`.
- Sheets that show list data derive via `useMemo` from the query cache.
- Centralized query keys — no local key constants.
- Prefetch on hover for list → detail.
- Responsive classes at 375/768/1440 in both themes.

**Backend (every PR touching `apps/backend/`):**

- camelCase at the API boundary; snake_case only in Prisma blocks and `@Query` URL params.
- Domain enums are Prisma enums; no hand-written enum literals next to enum fields.
- Every emit wraps in `new DomainEvent(...)`.
- Tenant scoping (`tenant_id` filter on every domain query).
- Migrations go through `tools/db/migrate.sh`.
- Scheduled jobs are DB-driven (no `@Cron`).
- TDD — services have co-located `*.spec.ts`.
- Calendar dates (`@db.Date`) are strings, not `Date` objects.
- DTO validation through Zod (re-exported from `@sally/shared-types` where appropriate).

**Conventions (every PR):**

- Conventional commit subject lines.
- `@appshore.in` for any newly-introduced email addresses.
- No new ad-hoc screenshots at repo root (must go to `.screenshots/`).

### Running it

In Claude Code on your branch:

```
/sally-review
```

You can also pass arguments — see the skill source. It runs against the diff of the current branch vs the merge base with `develop`.

### Responding to findings

For each finding:

- **Agree:** fix it, push the fix.
- **Disagree:** add a comment on the PR explaining why (e.g. "I disabled the `bg-white` dark-variant rule here because this is the print-stylesheet view"). Don't ignore findings silently — they'll show up in human review anyway.
- **Need clarification:** ask the team in the PR thread.

## Human review

Human review picks up where `/sally-review` leaves off — the things automation can't reliably see.

### What reviewers look at

- **Does this solve the right problem?** The diff might be clean code that addresses the wrong root cause.
- **Is the abstraction right?** Did we add a third service when we should have generalized an existing one? Did we add an option to a function that should be two functions?
- **What does this make harder later?** New conventions, new infrastructure, new dependencies — all have downstream costs.
- **Test coverage at the right level.** Was a unit test added when an API workflow test would have caught more? Or vice versa?
- **Migration / rollout story.** For schema changes and structural refactors — is there a safe path through?
- **Tone / naming.** Variable names, public surface names. The places where bad naming hurts forever.
- **Security and authorization.** Did we add an endpoint without checking what role can call it? Did we leak tenant data?

### How to request review

1. **Self-review first.** Open the PR in the GitHub diff view. Read your own changes top to bottom. Find at least one thing to fix. (There's always one.)
2. **Run `/sally-review`.** Address findings.
3. **Pick the right reviewer.** For backend domain changes, the domain owner. For frontend, a frontend regular. For architectural changes, the team lead or an architect. Don't routinely assign "@all" — that diffuses responsibility.
4. **Write a clear PR description.** See [Pull Requests](pull-requests.md#pr-description-template) for the template. The reviewer should be able to read the description and understand what they're being asked to review, without opening the diff.

### Responding to human reviews

- **Address every comment, even with just "done" or "explained in <link>".** Silence reads as "I disagree and won't say why."
- **Push fixes in additional commits, not force-pushes.** The reviewer needs to see what changed since they last looked.
- **Resolve conversations** when satisfied, but let the reviewer resolve when in doubt.
- **For substantive disagreements, push back in writing.** Don't capitulate silently. The goal is to land the right answer, not to make the reviewer feel listened-to.
- **Don't merge while review threads are open.** If the reviewer hasn't resolved a thread, it isn't done.

### When you're the reviewer

- **Read the PR description first.** If it doesn't explain what's being changed, ask before reading code.
- **Read the diff in two passes.** First pass: shape. Second pass: details.
- **Comment specifically.** "This isn't quite right" wastes everyone's time. "This will break if the user has multiple tenants because X" is reviewable.
- **Distinguish blocking from non-blocking.** GitHub's "Request changes" is for blocking. Non-blocking suggestions go in regular comments or "Comment" review type.
- **Approve only when you would land it yourself.** If you'd file follow-ups but it's "good enough for now," that's fine — say so explicitly. If you wouldn't ship it, request changes.

## Skill-driven reviews

For automated review workflows beyond `/sally-review`:

- **`/sally-execute`** — full implementation flow with built-in self-review. Useful when implementing from a plan.
- **`/sally-brainstorm`**, **`/sally-plan`** — pre-implementation. The earlier you catch a wrong direction, the cheaper the fix.
- **`/sally-qa-review`** — QA-focused review for test-coverage gaps.

All live under `.claude/skills/`. Read the SKILL.md files for what each does.
