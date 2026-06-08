---
title: Your First PR
description: Branch from develop, commit conventional, run local checks, open the PR. The gate model is mostly manual — read this carefully.
---

# Your First PR

This page walks you through opening a PR that won't surprise the reviewer.

## The shape

1. **Branch from `develop`.** Never from `main`. Use a descriptive branch name: `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `skill/<scope>`.

    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b feat/loads-add-revert-preview
    ```

2. **Make focused commits.** Conventional Commits format. Subject lines we use across the repo:

    ```
    feat(loads): add revert-preview endpoint for dispatcher rewind
    fix(billing): surface load PO/referenceNumber on invoice list
    docs(qa): add running-tests page to QA section
    chore(deps): bump prisma to 7.3.0
    refactor(events): collapse duplicate emit helpers
    ```

3. **Run local checks before pushing.** The repo does **not** have automated CI gating PRs (see [Quality Gate Model](#the-quality-gate-model-the-real-story) below). What ships is what you locally verified.

    ```bash
    pnpm format:check         # Prettier
    pnpm lint                 # ESLint, includes apps/backend's lint:schema guardrail
    pnpm type-check           # TypeScript across all apps
    pnpm test                 # Backend Jest (web Jest is misconfigured — see CLAUDE.md)
    pnpm build                # Everything builds clean
    ```

    Backend uses TDD per `CLAUDE.md`. If you added a service method, you added a spec for it. The frontend doesn't currently have unit tests; type-check + build + manual browser verification are the gates there.

4. **Open the PR against `develop`.**

    ```bash
    gh pr create --base develop --head feat/loads-add-revert-preview \
      --title "feat(loads): add revert-preview endpoint" \
      --body "<see template below>"
    ```

    **Squash merge** is expected. Your PR title becomes the squash-merge commit subject, so write it well.

## PR description template

```markdown
## Summary

One paragraph: what changes, why, how to think about it.

## Verification

How a reviewer can verify locally:
- Spin up backend + web with `pnpm dev:side`.
- Open `http://localhost:3001/dispatcher/loads`.
- Click "..." → "Revert" — should see the preview sheet before confirming.

## Risk / scope

What this touches; what it doesn't; what could break.

## Screenshots

Drop relevant ones from `.screenshots/` if there's UI work.

## Refs

- Spec / plan: `.docs/plans/2026-05-XX-<topic>.md`
- Issue: <link>
```

## The Quality Gate model — the real story

There is **no automatic CI** gating PRs in this repo right now.

- `ci.yml` is `workflow_dispatch` only. (Its header comment claims it runs on push and PR; that comment is stale.)
- `quality-gate.yml` (the Playwright suite) is also `workflow_dispatch` only — runs against staging on demand.
- `deploy-all.yml` and `deploy-frontend.yml` are `workflow_dispatch` only. Vercel's git-auto-deploy is disabled (`vercel.json: "deploymentEnabled": false`); deploys flow through Vercel deploy hooks invoked from the workflow.

So PR approval rests on:

1. **Your local checks** before pushing.
2. **Reviewer judgment** — code, design, conventions, tests.
3. **Optional: Quality Gate run** — for risky changes, the reviewer may request a run from the Actions tab and inspect the result.

This is the model the team operates today. It works because everyone follows the local-checks discipline. If you skip the local checks, broken code lands on `develop` and shows up in staging when someone next clicks Deploy.

## After merge

`develop` does **not** auto-deploy to staging. To get your change onto staging:

1. Actions → **Deploy All** → Run workflow. Pick `staging`. (Or **Deploy Frontend** if the change is web/console-only.)
2. Verify on staging after the workflow finishes — the staging URL is in the workflow output.

## Code review

Run `/sally-review` in Claude Code on your branch before requesting human review — it applies all the SALLY backend + frontend conventions and surfaces likely review comments. See [Contributing → Code Review](../contributing/review.md).

## Where to look when you're stuck

- **Patterns**: `sally-backend-patterns` and `sally-frontend-patterns` skills under `.claude/skills/`.
- **QA**: `sally-qa` skill, [Quality Gate](../qa/index.md).
- **Conventions**: [Conventions section](../standards/index.md).
- **Architecture**: [Architecture section](../architecture/index.md).
