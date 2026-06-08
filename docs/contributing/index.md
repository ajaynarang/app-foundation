---
title: Contributing
description: How to ship a PR to SALLY — branch, conventions, review, the manual-gate truth.
---

# Contributing

What follows is the short version. Each sub-page has the details.

## Before you start

1. **Run the [Environment Setup](../getting-started/environment-setup.md).** Doppler-injected secrets, default Docker profile, the apps running on their canonical ports.
2. **Read [Standards](../standards/index.md).** Three short pages — Platform, Backend, Frontend — covering the non-negotiable rules code review enforces.
3. **Check existing issues / PRs.** Avoid duplicate work. For large features, write a design doc under `.docs/plans/<YYYY-MM-DD>-<topic>.md` before touching code.

## The flow

1. Branch from `develop`. Never from `main`. See [Git Workflow](git-workflow.md).
2. Make focused commits with Conventional Commit subject lines.
3. Run local checks: `pnpm format:check && pnpm lint && pnpm type-check && pnpm test && pnpm build`.
4. Open a PR against `develop`. Squash merge. See [Pull Requests](pull-requests.md).
5. Address review comments. See [Code Review](review.md) for what reviewers look at and how `/sally-review` helps.

There is no automatic CI gating PRs in this repo right now — `ci.yml` and `quality-gate.yml` are both `workflow_dispatch` only. The gate is local checks + reviewer judgment. See [Pull Requests → Gate Model](pull-requests.md#the-gate-model).

## Sub-pages

| Page | When you need it |
|---|---|
| [Git Workflow](git-workflow.md) | Branch names, commit format, the develop/main rules |
| [Pull Requests](pull-requests.md) | PR description template, squash-merge rule, the gate model |
| [Code Review](review.md) | What `/sally-review` checks, the reviewer's perspective |

The rules code review enforces are on [Standards](../standards/index.md) — platform, backend, frontend.

## Adjacent reading

- [Getting Started → Your First PR](../getting-started/first-pr.md) — the full walk-through from clone to merged.
- [Standards](../standards/index.md) — the non-negotiable rules.
- [Backend Guide](../backend/index.md), [Frontend Guide](../frontend/index.md) — patterns.
- [Quality Gate](../qa/index.md) — what the suites cover.
