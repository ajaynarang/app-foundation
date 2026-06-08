---
title: Standards
description: SALLY's non-negotiable engineering standards — platform-wide, backend, and frontend. Code review enforces every rule here.
---

# Standards

The rules code review enforces. Three pages:

| Page | Scope | Read it when |
|---|---|---|
| [Platform Standards](platform.md) | Rules that apply everywhere — naming, enums, palette, emails, commits, secrets, screenshots | You're writing any code that lands in this repo. |
| [Backend Standards](backend.md) | NestJS-side rules — tenant scoping, DomainEvents, migrations, scheduled jobs, AI invocation, TDD, dates | You're editing `apps/backend/`. |
| [Frontend Standards](frontend.md) | Next.js-side rules — dark theme, Shadcn-only, Sheet vs Dialog, FormSheet, the 5-layer loading model, query keys, responsive | You're editing `apps/web/` or `apps/console/`. |

If a rule isn't on one of these three pages, it isn't a rule yet. Don't enforce it in review.

## How to use this section

- **Before opening a PR:** skim the page that matches your changes. The review checklists at the bottom of each page are what reviewers (and `/sally-review`) check against.
- **During review:** when a reviewer cites a rule, the link goes here. The rule statement is short; the example shows the right way and the wrong way side by side.
- **Adding a new rule:** open a PR against the relevant Standards page. New rules need team alignment, not a stealth PR.

## What's NOT here

- **Implementation patterns** (module shape, hook layouts, the FormSheet props interface). Those live in [Backend Guide](../backend/index.md) and [Frontend Guide](../frontend/index.md) — they teach you *how*, the Standards pages tell you *the rules*.
- **Architectural decisions** (why we use Prisma enums as source of truth, why Mastra is default for AI). Those live in [ADRs](../architecture/adrs/index.md) — they record the *why*, the Standards pages tell you *the rules*.
- **Workflow conventions for AI agents** (where Claude Code should save screenshots, when to invoke which skill). Those live in `CLAUDE.md` at the repo root — agent-facing, not for the developer docs site.
