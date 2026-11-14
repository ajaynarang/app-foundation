---
name: fx-conventions
description: Fixture index skill for the skills guard tests.
owner: foundation
sources:
  - apps/api/src/widget.ts#WidgetService
guards:
  - widget.spec.ts
---

# Conventions

Working on the API: read [the API reference](references/api.md). The legacy skill is `legacy`; the explorer is
`/fx-explorer`. Container names such as `fx-postgres` are reserved.

## Non-negotiables

- Lists go through `WidgetService.listWidgets`. [guard: widget.spec.ts]
- Dates are formatted once. [guard: lint:no-raw-date]
- Names are clear. [review-only: naming needs judgement]

## Flag in review

- Anything else.
