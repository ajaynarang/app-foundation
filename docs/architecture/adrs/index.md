---
title: Architecture Decision Records
description: Index of SALLY ADRs — what we decided, when, why, and whether it still holds.
---

# Architecture Decision Records

ADRs capture architectural decisions and the reasoning behind them. They are immutable history with one exception: an ADR can be **amended** when a decision evolves, and the status reflects that.

## Status values

| Status | Meaning |
|---|---|
| **Accepted** | Decision is current and unchanged. |
| **Amended** | Original decision still holds in spirit, but specifics have evolved. The body of the ADR reflects the current state and notes the amendment date. |
| **Superseded by ADR-NNN** | Replaced. The new ADR holds; this one is kept for history. |
| **Deprecated** | The thing this ADR describes is being phased out. |
| **Proposed** | A draft awaiting team review. Not yet in force. |

## Index

| # | Title | Date | Status | One-line summary |
|---|---|---|---|---|
| [001](001-monorepo-turborepo.md) | Monorepo with Turborepo + pnpm | 2025-06-01 | Accepted | Single repo, Turborepo orchestration, pnpm workspaces for all apps and packages. |
| [002](002-nestjs.md) | NestJS 11 Backend | 2025-06-01 | Accepted | NestJS as the backend framework, domain-driven modules, Prisma ORM. |
| [003](003-firebase-auth.md) | Firebase Authentication | 2025-06-01 | Accepted | Firebase for identity; backend issues its own JWT for session management. |
| [004](004-multi-tenant.md) | Multi-Tenant Row-Level Isolation | 2025-06-01 | Accepted | `tenant_id` foreign keys everywhere; guard-enforced tenant context. |
| [005](005-domain-driven.md) | Domain-Driven Module Organization | 2025-06-01 (amended 2026-05-20) | Amended | Original decision still holds; the count grew from 9 to 14 domains (added `analytics`, `billing`, `desk`, `home`, `prompting`). |
| [006](006-shadcn-dark-theme.md) | Shadcn/ui with Mandatory Dark Theme | 2025-08-01 | Accepted | Shadcn/ui + enforced dark theme + monochrome-leaning palette (see [Standards → Colors](../../standards/platform.md#color-palette-semantic-tokens-only) for the actual 8 named tokens). |
| [007](007-realtime-socketio.md) | Real-Time Architecture | 2025-08-01 (amended Mar 2026) | Amended | SSE-first for server-to-client push; WebSocket (Socket.IO) retained only for bidirectional dispatcher↔driver chat. Filename still says `socketio` for history. |
| [008](008-notification-channels.md) | Multi-Channel Notifications | 2025-10-01 | Accepted | Four channels (email, SMS, push, in-app) with tenant + user-level configuration. |

## Proposed (drafted 2026-05-20)

These are drafts. They cover decisions visible in the code that hadn't been ADR'd yet. Each is `Proposed` until the team reviews and accepts.

| # | Title | One-line |
|---|---|---|
| [009](009-observability-loki-tempo-grafana.md) | Observability: Loki + Tempo + Grafana | Supersedes Jaeger; Loki for logs, Tempo for traces, Grafana for the UI; opt-in profile locally. |
| [010](010-color-palette.md) | Color palette | Named status tokens (`--info`, `--caution`, `--warning`, `--critical`, `--success`) on top of the monochrome base. |
| [011](011-driver-keyed-messaging.md) | Driver-keyed messaging | Conversations key on the driver-dispatch pair, not load-id. |
| [012](012-domain-enums-as-prisma-enums.md) | Domain enums as Prisma enums | Single source of truth in `schema.prisma`; frontend imports the auto-generated mirror. |
| [013](013-ai-mastra-default-direct-sdk-exceptions.md) | AI invocation: Mastra default, explicit direct-SDK exceptions | Mastra agents are the default; six documented file-level exceptions call AI SDK directly. |
| [014](014-sally-desk-vocabulary.md) | Sally's Desk vocabulary | Runtime nouns are responsibility / episode / step. "Beat" is no longer used. |

## Adding a new ADR

1. Pick the next number. Don't skip numbers.
2. Copy `001-monorepo-turborepo.md` as a template.
3. Write the Context (what forces motivated the decision), Decision (what we chose), and Consequences (positives, trade-offs, neutral).
4. Set Status to `Proposed`.
5. Open a PR. Tag the people whose work the decision affects.
6. After acceptance, flip Status to `Accepted` and merge.

When a decision evolves materially, **amend** the existing ADR rather than writing a new one — set Status to `Amended`, add the amendment date, and rewrite the affected sections. Write a new ADR only when the decision is genuinely a replacement (and supersede the old one).
