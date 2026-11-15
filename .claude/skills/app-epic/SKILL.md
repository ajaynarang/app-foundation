---
name: app-epic
description: Use when starting, resuming or driving an epic from docs/epics.md — "work on E2", "start the next epic", "continue the epic", "pick up where we left off". Chains app-brainstorm, app-plan, app-execute, app-review and app-qa, keeps all state in GitHub issues and pull requests, and is safe to invoke from a fresh session at any point, including mid-epic with open pull requests.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
owner: foundation
guards:
  - script:verify
---

# Epic loop

You drive one epic from `docs/epics.md` end to end: breakdown, issues, then per slice plan, execute, review and the
merge gate, then QA and a demoable close. State lives in GitHub, so a fresh session resumes where the last one
stopped.

**Input:** $ARGUMENTS — an epic id (`E3`), the epic's issue number, or a follow-on slice id (`E3.1`). Optional literal
flag `auto-merge` (see the merge gate). No argument: the lowest-numbered epic whose issue is not closed.

## What this skill reads from `.claude/workflow.json`

- `defaultBranch` — what slices branch from and merge into.
- `githubProject` — a GitHub Projects number, or `null`. With `null`, skip every board step: state lives in the
  issues and pull requests alone. With a number, add each issue to that project (`gh project item-add <n> --owner
<owner> --url <issue-url>`) and set its status. Never write a project id into a skill or a doc.
- `plans` — where designs and plans go (`<plans>` below) and whether git tracks them:
  - **tracked** (a product, by default): the epic design rides in the first commit of slice 1's branch; each slice
    plan is committed on its branch; a PR links its plan. A fresh session finds everything in git.
  - **untracked** (the template, a public repo): read and write `<plans>` in the primary checkout (the first line of
    `git worktree list`). The epic issue body carries the design summary; each slice issue carries its task list and
    acceptance checks, enough to re-plan. A session on another machine re-plans a slice from its issue, and says so,
    instead of claiming a full resume. Nothing from the plans folder is posted.

## Ground truths

- **State lives in GitHub, never in this conversation.** Run phase 0 on every invocation, even when you think you
  remember.
- **The binding docs override improvisation.** Before any breakdown, read the epic's section of `docs/epics.md` and the
  parts of `docs/domain-map.md`, `docs/lifecycles-and-invariants.md`, `docs/event-vocabulary.md`, `docs/module-map.md`
  and `docs/adr/` it touches. Scope beyond the section needs the doc and ADR amendment in the same PR.
- **The human merges** unless this invocation's arguments contain the literal `auto-merge`. Never pass `--admin` to a
  merge unless the user asks for an admin override in this invocation, in those words.
- **Work in your own worktree** (`.worktrees/<slug>` or `.claude/worktrees/<slug>`), never the primary checkout another
  session may hold. A dirty tree or a branch that belongs to another epic is blocking: report it and stop. Never stash,
  discard or switch over work you do not own. A fresh worktree needs `pnpm install` and
  `pnpm backend:prisma:generate` before the backend type-checks.
- **CI is manual.** A PR normally has no CI run, and absence of checks is not a pass. The gate is `pnpm verify` on the
  head commit; its result line goes in the PR body.
- Work autonomously between gates. Stop at the merge gate, on blocking ambiguity, or when the epic closes.

## Phase 0 — Sync state (every invocation)

```bash
gh issue list --search "<E-id> in:title" --state all --json number,title,state
gh api repos/{owner}/{repo}/issues/<epic#>/sub_issues --jq '.[] | {number,title,state}'   # else the body's checklist
gh pr list --state open --json number,title,headRefName,body
git fetch origin && git status && git worktree list
```

No epic issue yet: create it (`gh issue create`) with the epic's `docs/epics.md` section as the body (and the design
summary, in untracked mode), add it to the project if there is one, then phase 1.

| Found                                                    | Do                                              |
| -------------------------------------------------------- | ----------------------------------------------- |
| Epic issue closed, plain epic id given                   | Report done, name the next epic, stop           |
| Follow-on slice id given (`E3.1`)                        | "Follow-on slices" below; the epic stays closed |
| No sub-issues                                            | Phase 1                                         |
| Open sub-issues, no open PR for the current slice        | Phase 2, next slice                             |
| An open PR whose `Closes #N` names this epic's sub-issue | Phase 2, step 4 (merge gate)                    |
| All sub-issues closed, epic open                         | Phase 3                                         |

A local `feat/*` branch with work for this epic's current slice means resume it, not restart.

## Phase 1 — Breakdown (once per epic)

1. Read the epic's section and every binding doc it names.
2. Run `app-brainstorm` on the epic's scope: the design goes to `<plans>/specs/<e-id>-design.md`. With the user away,
   answer the questions from the binding docs and record each call under "Decisions taken autonomously" for review at
   the first merge gate.
3. Break it into vertical-slice sub-issues (schema, service and API, tools, web, tests), each with acceptance checks
   and its own "demoable when". Group them into PR-sized slices, one PR per slice, and write the grouping as a
   checklist in the epic issue's body.
4. Create the sub-issues (`gh issue create`, then
   `gh api repos/{owner}/{repo}/issues/<epic#>/sub_issues -F sub_issue_id=<id>`), add them to the project if any. In
   untracked mode each sub-issue body carries the slice's task list and acceptance checks.
5. Set the epic's status in `docs/epics.md` to "in progress (#issue)" in slice 1's PR.

## Phase 2 — Slice loop (until no open sub-issue)

1. Take the next slice in checklist order. Run `app-plan` from the epic design, scoped to the slice:
   `<plans>/plans/<e-id>-<slice>-plan.md`.
2. Run `app-execute` on it. It branches, does TDD, runs `/app-dev-docs slice`, runs `pnpm verify` (and `verify:api`
   or `verify:scaffold` when they apply), opens the PR with `Closes #N` for every sub-issue of the slice, runs
   `/app-review` and fixes. It does not merge. The review verdict is a PR comment, so a fresh session can see it.
3. Run `app-test-notes` when the slice has something a person should check by hand.
4. **Merge gate.** Read the PR body's `pnpm verify` line and compare its sha with the head commit
   (`gh pr view <n> --json headRefOid,body`). Missing, stale or `+dirty`: run `pnpm verify` on the head commit and
   update the body; never offer the merge without a passing line for the head commit. Then:
   - `auto-merge` given, a passing line for the head commit, and a clean review verdict on the PR (none: run
     `/app-review pr <n>` first): `gh pr merge <n> --squash --delete-branch`, update the default branch, remove the
     slice worktree, continue the loop.
   - Otherwise: post a status comment on the epic issue (merged, awaiting merge, up next), tell the user the same, and
     end the turn. The next invocation resumes from phase 0 once the human has merged.

A slice that depends on an unmerged PR waits at the merge gate; no stacked slices unless the user asks.

## Phase 3 — Close-out (all sub-issues closed)

Close-out is itself a slice: a branch, a PR and the same merge gate.

1. Walk every "demoable when" against the running app (`app-verify`, or the `app-qa-runner` agent), not the suite.
2. Run `app-qa` to extend the API and RBAC suites over the epic's new surface.
3. Confirm every amended binding doc landed with its code. Run `/app-dev-docs epic`.
4. Set the epic's status in `docs/epics.md` to done with the date and closing PR.
5. Close the epic issue with a demo walkthrough comment; set its project status if there is a project. Name the next
   epic; do not start it unless asked.

## Follow-on slices (`E<n>.<m>`)

Small in-domain work found after an epic closed (a gap, a bug class, a UX fix) is a follow-on slice of that epic, not
a new one, when it serves the epic's section of `docs/epics.md`. One issue titled `E<n>.<m> — <name>`, attached as a
sub-issue of the closed epic, with a checklist line appended to the epic's body; the epic is not reopened. The issue
body is the acceptance check. Run phase 2 for it; record it under the epic in `docs/epics.md` in the same PR. Anything
wider is a new epic.

## Stop and correct when

- Code is being written before the epic has sub-issues with acceptance checks.
- You trusted remembered state instead of running phase 0.
- You are about to merge without `auto-merge` in this invocation, without a passing `pnpm verify` line for the head
  commit, or with `--admin` nobody asked for.
- A sub-issue was closed by hand, with no merged PR naming it.
- The breakdown changes scope beyond the epic's section without the doc and ADR amendment.
- You claimed CI passed when no checks ran.
- The epic is declared done without the "demoable when" walkthrough and `app-qa`.
