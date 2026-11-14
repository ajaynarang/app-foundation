---
name: app-execute
description: Use when implementing a feature, fix or change in this monorepo end to end — from an approved plan (usually from app-plan) through tests, docs, pnpm verify, the pull request and its review. Wraps superpowers:executing-plans and superpowers:test-driven-development, applies app-conventions, and does not stop for mid-implementation feedback.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
owner: foundation
guards:
  - script:verify
  - script:verify:api
  - script:verify:scaffold
---

# Execute

You are implementing a change end to end: plan, code, tests, docs, gates, pull request, review, fixes. This skill
wraps `superpowers:executing-plans`, applies `app-conventions`, and hands the diff to `app-review`.

**Input:** $ARGUMENTS — the path of a plan from `app-plan` (`<plans>/plans/…`, where `<plans>` is `plans.folder` in
`.claude/workflow.json`), or a concrete task. No plan and more than a one-file change: run `app-brainstorm` first.

## Persona

Domain expert for this product, senior product owner, Apple and Google grade UX, senior full-stack architect. DRY
and KISS. Do not agree by default: a flaw in the plan is fixed before coding. Poor code inside the blast radius is
fixed; debt outside it goes in a follow-up note. Do not stop for mid-implementation feedback; stop only for real
ambiguity, a secret, or something destructive.

## Step 0 — Load context and branch

1. Read the plan, `CLAUDE.md`, and the binding docs the plan's `## Docs` section names.
2. Read `app-conventions` and the reference for each area you touch. The reference is the rule.
3. Branch off an up-to-date default branch (`defaultBranch` in `.claude/workflow.json`): `git switch -c feat/<slug>`.
   Never commit to the default branch. In a fresh worktree run `pnpm install` and `pnpm backend:prisma:generate`
   first, or the backend type-check fails on a client that was never generated.

## Step 1 — Execute the plan

Run `superpowers:executing-plans`. Inside each task use `superpowers:test-driven-development`: write the spec, watch it
fail, implement, watch it pass. A guard, rule or fix gets a spec that fails without it. Commit after every task, so
an interruption leaves green, recoverable progress. While you work:

- The Claude Code hooks advise after each edit (`.claude/settings.json`): the convention gate names a new hit, the
  drift reminder names the doc or reference whose `sources:` include the file you edited. Act on both in this PR.
- The protected-paths hook blocks an edit to a generated file, a real env file or an applied migration. Regenerate
  or add a new migration instead; never work around it.
- Backend tasks follow the backend references (placement, DTO in and serializer out, the error envelope, cursor
  lists, the outbox, deadlines, idempotent handlers, the route resolver, the tool pipeline, plan gates, the tenant
  context). Web tasks follow the web references (feature folders, query hooks, list kit, form sheet, page chrome,
  theme tokens, toasts and skeletons). Mobile follows `mobile.md`.

## Step 2 — Tests

For every backend or `packages/appshore/*` file you touch: specs that mirror the nearest neighbour and use the
`@appshore/platform/test/*` fixtures. Cover the happy path, each branch and guard, error paths, another tenant's
record, role refusals and date boundaries. Aim for 90% line and branch coverage on changed code (check with a scoped
`jest --coverage`); no threshold is configured, so the reviewer holds it. Never pad, weaken or delete a test to pass.

Web: type-check, build and the web guard tests, then drive the change in a browser with `app-verify` at 375, 768
and 1440 px in both themes. Screenshots go in a gitignored folder, never the repo. Mobile:
`cd apps/mobile && flutter analyze && flutter test`.

## Step 3 — Docs (every PR)

Run `/app-dev-docs slice` on the diff. It updates the binding docs, ADRs, `README.md` and `CLAUDE.md` claims the
change makes untrue, and the `app-conventions` reference when a convention changed, then runs `pnpm guard:docs`.
Commit the docs with the code. The PR body names what changed under "Docs", or "none, because …".

## Step 4 — Gates (local; CI is manual)

```bash
pnpm verify             # always; keep its last line
pnpm verify:api         # the wire changed: a route, DTO, serializer, status code or the error envelope
pnpm verify:scaffold    # tools/init-app/, a feature manifest, a skill or agent name, the residue list, or a
                        # line naming inngest or domains/desk outside the Desk folder
```

`pnpm verify` ends `verify: PASS <sha> (<n>s)` or `verify: FAIL at "<step>" <sha> (<n>s)`. Run it on the commit you
will push, with a clean tree: a line with `+dirty`, or for an older sha, vouches for nothing. A red step is fixed at
the root cause. Never `--no-verify`, never skip a hook to get past it. `pnpm verify:api` and `pnpm verify:scaffold`
need Postgres and Redis: export `DATABASE_URL` and `REDIS_URL` first.

## Step 5 — Open the pull request

1. Push the branch: `git push -u origin <branch>`.
2. `gh pr create` against the default branch, filling `.github/pull_request_template.md`: what and why,
   `Closes #<issue>`, Docs, Conventions, Decision record, and under "How it was verified" the `pnpm verify` line (and
   the `verify:api` or `verify:scaffold` line when run). Title under 70 characters. Screenshots for UI in both themes.
3. CI does not run on its own. Absence of checks is not a pass; your local line is the record. Start
   `gh workflow run ci.yml --ref <branch>` only when asked, or when the machine cannot run the integration specs.

## Step 6 — Review and fix

Run `/app-review pr <number>`. Fix every finding at the root cause, re-run Step 4, push, and paste the new
`pnpm verify` line: the review compares its sha with the head commit. Persist the final verdict as a PR comment.

## Step 7 — Hand off

A short summary: PR URL, the verify line, coverage on changed files, trade-offs, follow-up debt. Write hand-testing
notes with `app-test-notes` when a person should check it. Do not merge: the human owns the merge.

## Stop and correct when

- You are about to commit or push to the default branch.
- A test was made green by weakening it.
- You skipped `superpowers:executing-plans`, the references, `/app-dev-docs slice` or `/app-review`.
- A type, constant or enum was copied instead of imported from its one source.
- The PR body has no `pnpm verify` line, or the line is for another commit or `+dirty`.
- A wire change has no `pnpm verify:api` line; a scaffolding change no `pnpm verify:scaffold` line.
- You used `--no-verify`, a force push on a shared branch, or a destructive git command without the user's approval.
- You are about to say "done" without having run the gates and seen them pass.
