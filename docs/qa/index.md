---
title: Quality Gate
description: The SALLY test suites — what they cover, where they live, how the gate model actually works (mostly manual).
---

# Quality Gate

SALLY's tests live in two places: backend unit tests co-located with source (`apps/backend/src/**/*.spec.ts`) and cross-cutting tests in the `tests/` workspace (`@sally/qa`).

This page is the map. [Running Tests](running-tests.md) is the command catalog. [Writing Tests](writing-tests.md) is the patterns.

## Test layout

```
apps/backend/src/**/*.spec.ts        Unit tests — Jest, TDD per CLAUDE.md
apps/web/                            (No working unit tests — Jest misconfigured; gated on type-check + build + browser)
apps/console/                        (Same as web)
packages/test-utils/                 Shared factories, role fixtures, Zod response schemas (@sally/test-utils)

tests/                               @sally/qa — Playwright workspace
├── smoke/                           @smoke — health + security-headers + auth (~30s)
├── rbac/                            @rbac — role × endpoint matrix (~2min, auto-generated + curated)
├── api/                             @workflow / @contract — multi-step domain chains
│   ├── fleet/                       drivers, vehicles, loads, trailers, lanes, docs
│   ├── financials/                  invoicing, settlements, close-out, IFTA, lumper
│   ├── operations/                  alerts, command center, routing, convoy, smart routes
│   ├── platform/                    admin, integrations (Samsara, QBO, EDI), tickets
│   ├── ai/                          document intelligence, email intake
│   └── contracts/                   response-shape sweeps
├── browser/                         Playwright UI critical paths (~2min)
├── loadtest/                        autocannon baselines (~5min)
├── evals/                           AI evals — SCAFFOLD ONLY, not active
├── fixtures/                        Thin re-exports to @sally/test-utils
├── config/                          global-setup, test-env
└── scripts/                         RBAC matrix gen, gap audit, confidence matrix
```

## What each suite proves

| Suite | Tag | Speed | What it proves |
|---|---|---|---|
| Unit (backend Jest) | — | seconds | Service-level behavior, mocked Prisma + events |
| Smoke | `@smoke` | ~30s | System alive, auth works, security headers correct, critical reads respond |
| RBAC | `@rbac` | ~2min | Every endpoint × every role returns the correct access/denied result |
| API workflow | `@workflow` | ~3min | Multi-step business flows: create load → assign driver → dispatch → deliver → invoice → settle → pay |
| API contract | `@contract` | included | Response shapes haven't drifted from the Zod schemas |
| Browser | `@browser` | ~2min | Login, dashboard, page navigation, no JS errors on critical paths |
| Loadtest | — | ~5min | Baseline perf — 50 concurrent users × top 10 endpoints |
| Evals | — | — | **Not active** — scaffold for AI prompt regression evals |

## How the gate actually works

This is the part new contributors get wrong. **There is no automatic CI gating PRs in this repo right now.**

- `ci.yml` is `workflow_dispatch` only. (The header comment says otherwise; the comment is stale.)
- `quality-gate.yml` is also `workflow_dispatch` only — runs against staging when a human clicks "Run workflow."

What does the gating, then?

1. **Local checks before push.** `pnpm format:check && pnpm lint && pnpm type-check && pnpm test && pnpm build`. If you skip these, broken code lands on `develop`.
2. **Reviewer judgment.** Code review (often with `/sally-review` from the Claude skill set as a first pass) catches design, conventions, and obvious test gaps.
3. **Optional Quality Gate run.** For risky changes, the reviewer may trigger the `Quality Gate` workflow against staging from the Actions tab and inspect the result before approving.

This model works because the team follows the local-check discipline. If you find yourself thinking "CI will catch it," remember: **CI is manual**.

## Where reports live

- **CI artifacts** — uploaded as `unit-results-<run>` and per-suite artifact names. Retention 30 days. Pull via the Actions UI or `gh run download`.
- **Locally** — `tests/reports/` (gitignored).
- **Site-published latest** — the docs deploy workflow copies the latest `docs/overrides/qa-report.html` to the site root as [`qa-report.html`](../qa-report.html){ target="_blank" }.
- **Site-published history** — timestamped reports under [`reports/`](reports/){ target="_blank" }.

## Adjacent pages

- [Running Tests](running-tests.md) — the `pnpm test:*` catalog, env vars, the Doppler-injection variants.
- [Writing Tests](writing-tests.md) — file layout, role fixtures, factories, conventions.

## Adjacent skills

The `sally-qa` Claude skill is the canonical reference for the QA Director persona — it covers the same material this page covers, plus the day-to-day operating procedure (regenerate RBAC matrix after controller changes, analyze code changes for missing coverage, publish the confidence report). Use `/sally-qa` and friends (`/sally-qa-add-api`, `/sally-qa-add-browser`, `/sally-qa-add-smoke`, `/sally-qa-run`, `/sally-qa-fix`, `/sally-qa-review`) in Claude Code.
