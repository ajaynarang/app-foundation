# ADR-0007 — CI is manual by default; enforcement is local

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

A product built from this starter is often one person or a small team on a private repository, where every
GitHub Actions minute is paid for and most pushes are work in progress. A CI job that runs on every push costs money
on every push and, once it is a required check, blocks every pull request when it is slow, flaky or out of minutes.

Rules that matter still have to hold on every change. If they live only in a CI job, turning that job off (or never
turning it on) turns the rules off with it.

## Decision

**Every GitHub Actions workflow runs only when someone starts it. What must always run, runs on the developer's
machine, and the same commands run in CI when CI is started.**

- **Every workflow's only live trigger is `workflow_dispatch`.** It runs from the Actions tab or with
  `gh workflow run <file>`.
- **Check workflows** (`ci.yml`, `grafana-as-code.yml`, `container.yml`, and any check added later) keep their
  `push` and `pull_request` triggers in the file, commented out under a one-line note that says how to turn them on.
- **Deploy and apply workflows** (`deploy-all.yml`, `deploy-frontend.yml`, `quality-gate.yml`, `grafana-apply.yml`)
  have `workflow_dispatch` only, with no commented triggers. They change a live environment and never run on a push.
- **Enforcement is local, in order of cost:**
  - the pre-commit hook (`.husky/pre-commit`): Prettier on the staged files;
  - the pre-push hook (`.husky/pre-push`): `pnpm verify:arch` (the backend architecture specs and the web guard
    tests) on every push, and `pnpm check:ops` when the push touches `infra/`, `docs/runbooks/`, `.github/` or
    `tools/`;
  - `pnpm verify` before a pull request: format check, lint, schema lint, type-check, every package's unit tests
    through turbo (all but the Playwright suite), the init-app tool tests, `pnpm check:ops`, the RBAC gap audit
    (`pnpm audit:rbac`) and the build;
  - `pnpm verify:api` before a pull request that changes the wire, and `pnpm verify:scaffold` before one that
    touches scaffolding.
- **The record is the result line.** `pnpm verify` ends with one line (`tools/verify/result-line.sh`):
  `verify: PASS <sha> (<seconds>s)` or `verify: FAIL at "<step>" <sha> (<seconds>s)`. The sha is the short commit
  the run started on; `+dirty` after it means the tree had uncommitted changes, or HEAD moved during the run, so the
  line does not vouch for that commit alone. The line goes in the pull request body. A reviewer checks the sha
  against the pull request's head commit: a missing line, a stale sha or `+dirty` is a finding.
- **CI runs the same commands.** `ci.yml` runs every unit suite with the same `turbo run test --filter=!@app/qa`
  that `pnpm verify` runs, against its own Postgres and Redis, and the RBAC gap audit fails the run. A rule that must
  always hold is a Jest spec, a guard script or part of `check:ops`, never a CI job alone.
- **Hooks can be skipped** (`git commit --no-verify`, `git push --no-verify`). That is allowed; the `pnpm verify`
  line in the pull request is what a reviewer relies on, not the hooks.

**How a product turns CI on.** Three steps:

1. Uncomment the `push` and `pull_request` triggers in each check workflow.
2. Record the change in the repository's workflow settings, so the CI-triggers guard expects the triggers (the
   setting and the guard come with the repository guards).
3. If wanted, make these checks required in branch protection: `format`, `backend`, `web`, `ui`, `mobile` (when the
   app has one), `api-qa`, `scaffold-variants`, `terraform`, and the guards workflow's job once it exists.

The template itself sets no required check: with manual CI, a required check would block every pull request.

## Consequences

- Nothing is billed and nothing blocks a pull request unless someone asks for a CI run.
- The local gates are the enforcement, so they must not lose a step unnoticed: `tools/verify/gates.test.sh` (run by
  `pnpm check:ops`) fails when `verify.sh` or the pre-push hook drops one of its steps, and
  `tools/verify/result-line.test.sh` holds the result line's format.
- A pull request opened without a `pnpm verify` line has not been checked by anything. Review treats that as a
  finding.
- A developer whose machine cannot run the integration specs (no Postgres or Redis) can start the `CI` workflow on
  the branch instead: `gh workflow run ci.yml --ref <branch>`.

### Amendment — 2026-11-14: the CI-triggers guard and the `ci` key

- Step 2 of "How a product turns CI on" is now concrete: set `ci` to `on-push` in `.claude/workflow.json`. The
  file's `manualAlways` list names the deploy and apply workflows (`deploy-all.yml`, `deploy-frontend.yml`,
  `quality-gate.yml`, `grafana-apply.yml`), which never carry a push or pull request trigger, live or commented.
- The rule is held by `tools/guards/ci-triggers.mjs` (`pnpm guard:ci`, part of `pnpm guards`), which runs in the
  pre-commit and pre-push hooks and in `pnpm verify`. In `manual` mode it also fails on a live `schedule` or
  `workflow_run` trigger, since nothing in CI may start on its own. Every check workflow's note now names both steps,
  so uncommenting alone fails the guard.
- The guards workflow is `.github/workflows/guards.yml`; its job, for step 3, is `workflow-guards`.
- "Enforcement is local" above now has the guards in every layer: the pre-commit hook runs `pnpm guards` after
  Prettier on the staged files, and the pre-push hook and `pnpm verify` run `pnpm guards` and `pnpm test:guards`.

### Amendment — 2026-11-14: the convention gate and the Claude Code hooks

- The convention gate (`tools/guards/convention-gate.mjs`, `pnpm guard:conventions`) joins `pnpm guards`, so it runs
  in the pre-commit and pre-push hooks and in `pnpm verify`. It also runs through `lint-staged` on the staged `.ts`
  and `.tsx` files, after Prettier. Its baseline (`tools/guards/convention-gate.baseline.json`) may only fall.
- The Claude Code hooks in `.claude/hooks/` (wired in `.claude/settings.json`) are the fast warning while an
  assistant edits: the protected-paths hook blocks an edit to a generated file, a real env file or an applied
  migration; the convention gate and the drift reminder advise and never block. Their fixture tests,
  `pnpm test:hooks`, run in the pre-push hook, in `pnpm verify` and in `guards.yml`.
