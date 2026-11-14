---
name: app-standards-audit
description: Audit one engineering area of this monorepo (api, web, tests, docs, …) against the written standards in app-conventions and the ADRs, produce an evidence-backed gap ledger where every gap names the guard that will keep it closed, and file the gaps as slices. Use for "audit the API", "are our endpoints consistent", "standards audit", or to recheck an earlier ledger.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
owner: foundation
guards:
  - script:guards
  - script:verify:arch
---

# Standards audit

You own cross-cutting consistency. Product epics build the product; an audit finds where the code drifted from its
own standards; the slices close the gaps; a guard keeps each one closed.

**Command:** $ARGUMENTS — an area (`api`, `web`, `tests`, `docs`, …), optionally `recheck` to re-verify an existing
ledger instead of a fresh audit.

## Where things live

| Piece                   | Home                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| The rules               | `app-conventions` (the index and its references), the ADRs in `docs/adr/`, `CLAUDE.md`                       |
| What to check, per area | `areas/<area>.md` in this skill: a rubric that points at the rules, never restates them                      |
| The findings            | `<plans>/audits/<YYYY-MM-DD>-<area>-audit.md`, the ledger (`<plans>` from workflow.json)                     |
| The work                | a GitHub issue for the audit, one sub-issue per slice (as in `app-epic`)                                     |
| What keeps a gap closed | a spec in `apps/backend/src/architecture/`, a web guard test, a lint rule, a gate rule or a repository guard |

`<plans>` is `plans.folder` in `.claude/workflow.json`; while `plans.tracked` is `false`, the ledger stays in the
primary checkout and the issue carries its summary and slices, never the ledger itself.

**No rubric for the area yet?** Write `areas/<area>.md` first and show it to the user before auditing: the rubric is
the contract for "consistent". Give it `owner: foundation` (or `product`) frontmatter, `sources:` for the code it
inventories and `guards:` for what already holds part of it, and link it from the Rubrics line below so the skills guard
keeps it true. Each check in it names the reference section it applies and the guard, if any, that already holds it.

**Rubrics** (one line per area, each a link):

- [`api`](areas/api.md): the HTTP contract, errors, lists, access for people and agents, events and webhooks on the
  wire.

## The evidence rule

Every gap cites the `file:line` you read in this session, and a count when it is a pattern ("14 of 61
controllers"). No evidence, no gap. "Clean" needs evidence too: for each check, record what you sampled, so a reader
can tell checked-and-clean from not checked.

## Phase 0 — Sync

```bash
gh issue list --search "<area> audit in:title" --state all --json number,title,state
git fetch origin && git worktree add .worktrees/<area>-audit origin/<default-branch>   # never audit a dirty tree
pnpm install && pnpm backend:prisma:generate
```

An existing ledger and `recheck`: go to phase 4.

## Phase 1 — Inventory, before judging

List the whole surface the rubric covers (every controller and route, DTO, query DTO, list, event, job, tool, web
list page, form) in a table at the top of the ledger. Prefer a script to reading: `grep` the decorators, or reuse
what a guard already walks (the architecture specs read the controllers; `tests/scripts/audit-rbac-gaps.ts` reads
every route's roles; the OpenAPI documents list every public route). Coverage claims are only as good as this
inventory. Run `pnpm guards` and `pnpm verify:arch` first: anything a guard already reports is recorded as held, not
re-audited.

## Phase 2 — Check, in parallel

Split the rubric's sections across `app-explorer` agents, one per section, sent in one message. Each gets the rubric
section, the inventory and the evidence rule, and returns, per check: the verdict (clean, gap or partial), the
evidence, the count and notes. Then spot-verify at least two gap and two clean verdicts per agent yourself: agents
over-report and under-sample.

## Phase 3 — Ledger and slices

Write the ledger with these parts:

1. **Summary** — one paragraph a product owner can read: what is solid, what is not, the riskiest gap.
2. **Inventory.**
3. **Gap ledger** — columns `ID | Check | Severity | Evidence | Fix | Guard`. Severity: `S1` security, data leak or
   tenant boundary; `S2` a contract break a client hits; `S3` an inconsistency with no client harm yet. **Guard** is
   mandatory: the spec, lint rule, gate rule or guard that will fail if the gap reopens, existing or to be written. A
   gap with no guard cannot be closed; a rule nothing can check is recorded `review-only` with the reason.
4. **Clean checks** — what passed, and what was sampled.
5. **Proposed slices** — gaps grouped into PR-sized slices, S1 first. Each slice: the gaps it closes, the guard it adds,
   "demoable when".
6. **Decisions needed** — where the rules are silent or contradict each other. Each becomes a reference or ADR
   amendment, never a silent choice.

**Stop and show the ledger to the user.** File nothing and fix nothing until they agree on the slices and the
decisions.

## Phase 4 — File, or recheck

- **File** (after approval): one sub-issue per slice under the audit issue, each with its gaps, guard and acceptance
  checks; the slice checklist in the audit issue's body. Slices then run like any slice: `app-plan`, `app-execute`,
  `app-review`, the human merges.
- **Recheck:** re-run every ledger row against the current default branch and mark it `closed (guard: <name>)`,
  `open` or `regressed`. A closed row whose guard no longer exists is `open`.

## Rule amendments

When a slice settles a decision, the rule goes into the `app-conventions` reference that owns the area (or the index,
for a rule that holds in every layer), with its guard tag, in the same PR as the code and the guard. The ADR is
amended when the decision is one it records. The rubric points at the rule; it never becomes a second copy of it.

## Stop when

- A gap has no `file:line`, or a clean check has no sample.
- You are fixing code during the audit.
- A slice has no guard.
- A rule is being written into the rubric instead of the reference.
- Issues are filed before the user has seen the ledger.
- The checkout is dirty or stale.
