---
title: "ADR-010: Color Palette — semantic tokens"
description: Use named tokens for all product UI; light + dark variants mandatory; status tones limited to defined tokens.
---

# ADR-010: Color Palette — semantic tokens

**Date:** 2026-05-20
**Status:** Proposed — drafted from observed CSS tokens; awaiting acceptance.

## Context

SALLY's product UI started monochrome (black, white, gray) per ADR-006 (Shadcn + dark theme). As the product grew, certain UI concepts needed semantic color — alerts have severity, mutations have success/failure feedback, links should look interactive. The team needed to decide: keep monochrome strictly and use only gray + Shadcn defaults, or define a constrained palette of named semantic tokens.

A third question: previous notes claimed the palette was "4-color minimal, no green, no orange," but the actual CSS file at `packages/ui/src/styles/globals.css` defines 8 named tokens including `--success` (green) and `--warning` (orange). The team needs to ratify what's actually in the code.

## Decision

**The palette is the set of named tokens in `packages/ui/src/styles/globals.css`.** Product UI uses tokens by name, not raw Tailwind palette numbers.

Tokens currently defined (with the role each plays):

- `--background`, `--foreground` — page surface and primary text.
- `--card`, `--card-foreground` — card surface.
- `--primary`, `--primary-foreground` — main actions (black in light, white in dark).
- `--muted`, `--muted-foreground` — subtle backgrounds and secondary text.
- `--accent`, `--accent-foreground` — neutral hover (used by Shadcn Calendar, Combobox).
- `--border`, `--input`, `--ring` — form chrome.
- **Status tokens:**
  - `--info` (steel blue) — links, informational.
  - `--caution` (yellow) — approaching-limit warning.
  - `--warning` (orange) — needs attention, medium severity.
  - `--critical` (red) — safety, destructive, immediate.
  - `--success` (green) — confirmed, complete, positive.
- `--destructive`, `--destructive-foreground` — Shadcn-standard alias matching `--critical`.

Both light (`:root`) and dark (`.dark`) variants are required for every token.

**Rules for product code:**

1. Use the tokens via Tailwind utilities (`bg-primary`, `text-caution`, `border-critical`). Never raw Tailwind palette numbers (`bg-green-500`).
2. If you need a color that doesn't have a token, either add a token (and update this ADR) or use a raw color with **explicit light + dark variants** (`bg-gray-50 dark:bg-gray-900`).
3. Status colors are bounded to the five named status tokens. Don't invent new severity levels — if `caution` and `warning` both feel right, pick one in review.

**Out of scope:**

- Marketing pages under `apps/deck/` are static HTML and can use any colors the brand calls for.

## Consequences

### Positive

- Theme swap between light and dark works by construction.
- Status colors are bounded — readers learn what each token means once.
- The CSS file is the single source of truth; the docs cite it rather than duplicating values.
- Onboarding is shorter — the [Standards → Colors](../../standards/platform.md#color-palette-semantic-tokens-only) page is a 5-minute read.

### Trade-offs

- Adding a new token requires a discussion and a PR — it isn't ad-hoc.
- Designers need to be aware of the available token set rather than picking from the full Tailwind palette.

### Neutral

- The previous "no green, no orange" guidance was inaccurate against the code. This ADR ratifies what's actually in `globals.css` rather than trying to remove green and orange from a codebase that already ships them.

## Evidence

- `packages/ui/src/styles/globals.css:1-100` — the 8 named tokens with HSL values for both modes.
- `apps/web/src/app/globals.css` — pulls in the tokens.
- Memory pin: `color_theming_system.md` (carries the "4-color minimal" framing — superseded by reality).
- This ADR supersedes the older "4-color minimal" guidance.
