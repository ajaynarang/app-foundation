---
sources:
  - .claude/workflow.json
  - .claude/settings.json
  - tools/verify/verify.sh
  - .husky/pre-commit
  - .husky/pre-push
  - .github/pull_request_template.md
---

# How we build

The playbook for building a product on this starter: the sizes of work, the loop each one runs, who does what, and
the gates that hold it. The skills and agents named here live in `.claude/`; each is invoked as `/<name>` in Claude
Code. A product's skills carry its own prefix (`skillPrefix` in `.claude/workflow.json`); the template's is `app`.

The rules themselves are not here. They are in the conventions skill (`.claude/skills/app-conventions/SKILL.md`, an
index with one reference per area) and in the binding docs and ADRs listed in `CLAUDE.md`. Every rule names the guard
that holds it, or says "review-only" and why (ADR [Workflow](adr/0015-workflow-conventions-index-guards-domain-skill.md)).

## Three sizes of work

| Size      | What it is                                            | The loop                                                                  |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| A fix     | One behaviour, a few files, no new decision           | `/app-execute` on the task directly; it still runs the gates and a review |
| A feature | One vertical slice: schema, endpoint, event, job, web | `/app-brainstorm`, `/app-plan`, `/app-execute`                            |
| An epic   | Several slices from `docs/epics.md`, ending demoable  | `/app-epic`, which runs the feature loop once per slice                   |

A product's first days are their own size, the runway: `/app-runway` interviews the owner and fills the binding docs
in the order `docs/README.md` gives (vision, domain map, lifecycles and invariants, the first ADRs, event vocabulary,
module map, epics), one at a time with the owner's yes on each, then fills the product's domain skill from them. Then
build epic E1. How the domain skill reaches the rest of the workflow is [Adding your domain](adding-your-domain.md).

## The loop

1. **Brainstorm** (`/app-brainstorm`). Reads `CLAUDE.md`, the binding docs the idea touches and the conventions
   index, then runs `superpowers:brainstorming`. Writes a design into the plans folder.
2. **Plan** (`/app-plan`). Turns the design into ordered tasks, each naming its placement, the references it follows
   and its tests. Every plan has a `## Docs` section, and its last task is `/app-dev-docs slice`.
3. **Execute** (`/app-execute`). Branches, builds test first, commits per task, updates the docs, runs the gates,
   opens the pull request with the `pnpm verify` result line in its body.
4. **Review** (`/app-review`). Runs the guards, lint and the architecture specs first, checks the verify line against
   the head commit, then sends one `app-reviewer` agent per dimension (correctness, authz-tenancy, contract,
   conventions, tests, performance, ui, mobile, domain). No reviewer is spent on a rule a machine holds.
5. **Verify by hand where it matters.** `/app-verify` drives the running app (which port, which build, which
   database); `/app-test-notes` writes a short script for the owner to click through; `/app-qa` runs and extends the
   Playwright suite.
6. **Merge.** The owner merges. `/app-epic` offers a merge only with a passing verify line for the head commit and a
   review verdict on the pull request.
7. **Deploy** (`/app-deploy`). Works out what changed since the running release, starts the manual deploy workflow
   and watches it to green. Staging by default; production only from `main`, by a listed deployer, on an explicit
   go-ahead.

Two more skills run alongside: `/app-dev-docs` (modes `slice`, `epic`, `audit`) keeps the docs true to the code, and
`/app-standards-audit` audits one area against the written standards and files each gap with the guard that will keep
it closed.

<!-- feature:desk:start -->

Desk work (a new background responsibility on the workflow engine) has its own skill, which the conventions index
routes to; it wraps the same plan, execute and review loop.

<!-- feature:desk:end -->

### The agents

| Agent           | Used for                                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| `app-explorer`  | A read-only sweep of the code that returns conclusions with `path:line`, not file dumps |
| `app-reviewer`  | One review dimension per run; a finding needs a concrete failure or it is dropped       |
| `app-qa-runner` | Driving the running app and reporting only what it observed                             |
| `app-persona`   | Playing one of the product's personas (from its domain skill) and reporting friction    |

## Sequential or parallel

- **Slices of one epic run in order.** A slice that depends on an unmerged pull request waits at the merge gate.
- **Two epics run in parallel only when their modules differ** (`docs/module-map.md`); the epic's entry in
  `docs/epics.md` lists the modules it touches.
- **Each session works in its own worktree** (`.worktrees/<slug>`). A session never stashes, discards or switches over
  another session's work. A fresh worktree needs `pnpm install` and `pnpm backend:prisma:generate`.

## Who does what

- **The owner** decides scope (the binding docs, the epic order), answers the design questions that matter, reads each
  pull request's verify line and review verdict, and merges. Nothing merges without the owner unless the owner said
  `auto-merge` for that run.
- **The assistant** runs the loop: designs, plans, builds, tests, documents, reviews, and reports honestly what it ran
  and what it could not.
- **The machines** hold every rule they can: the Claude Code hooks while editing, the git hooks on commit and push,
  `pnpm verify` before a pull request. A rule that keeps coming up in review becomes a guard.

## A deviation is an amendment

Deviating from a binding doc, an ADR or a convention is allowed only as an amendment in the same pull request as the
code: change the doc (and the ADR it rests on, or the reference that states the convention), and say so in the pull
request (`.github/pull_request_template.md` asks). A product changes a foundation rule only in its own domain skill,
under "Where this product differs", with a link to the ADR that records why
([Adding your domain](adding-your-domain.md)). Never drift silently.

## The gates

CI is manual (ADR [CI is manual by default; enforcement is local](adr/0007-ci-manual-enforcement-local.md)). What
must always run, runs on the developer's machine, cheapest first:

| When                  | What runs                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| On every edit         | The Claude Code hooks (`.claude/settings.json`): protected paths block; the convention gate and the drift reminder advise                     |
| On every commit       | `.husky/pre-commit`: Prettier and the convention gate on staged files, then `pnpm guards`                                                     |
| On every push         | `.husky/pre-push`: `pnpm verify:arch`; `pnpm check:ops` when the push touches ops files; `pnpm guards`, `pnpm test:guards`, `pnpm test:hooks` |
| Before a pull request | `pnpm verify` (format, lint, schema lint, type-check, unit tests, guards and their tests, hook tests, `check:ops`, the RBAC audit, build)     |
| Wire changed          | `pnpm verify:api` (boots the backend and runs the Playwright `api` project)                                                                   |
| Scaffolding changed   | `pnpm verify:scaffold` (scaffolds the variants and checks each one)                                                                           |

`pnpm verify` ends with one line, `verify: PASS <sha> (<n>s)` or `verify: FAIL at "<step>" <sha> (<n>s)`, with `+dirty`
after the sha when the tree had uncommitted changes. That line goes in the pull request body; a reviewer checks the sha
against the head commit. The git hooks can be skipped with `--no-verify`. That is allowed, and it is why the verify
line in the pull request, not the hooks, is the record a reviewer relies on.

### Turning CI on

CI workflows run only when started (`gh workflow run <file>`). A product that wants them on every push and pull
request takes three steps, in one commit:

1. Uncomment the `push` and `pull_request` triggers in each check workflow (`ci.yml`, `guards.yml`, `container.yml`,
   `grafana-as-code.yml`). The deploy and apply workflows (`manualAlways` in `.claude/workflow.json`) never get them.
2. Set `ci` to `on-push` in `.claude/workflow.json`. Without it `pnpm guard:ci` fails the commit and the push.
3. If wanted, make these checks required in branch protection: `format`, `backend`, `web`, `ui`, `mobile` (when the
   app has one), `api-qa`, `scaffold-variants`, `terraform`, and `workflow-guards`.

The template sets no required check: with manual CI, a required check would block every pull request.

## Where plans live

Designs, plans, test notes and audit ledgers go in the plans folder (`plans` in `.claude/workflow.json`). In a
product they are tracked by default and committed on the slice branch, so a fresh session finds them in git. In the
template, a public repository, the folder is gitignored: the skills read and write it in the primary checkout, and
the epic and slice issues carry enough (the design summary, each slice's tasks and acceptance checks) to re-plan on
another machine.
