---
title: "ADR-006: Shadcn/ui with Mandatory Dark Theme"
description: Decision to use Shadcn/ui components with enforced dark theme support.
---

# ADR-006: Shadcn/ui with Mandatory Dark Theme

**Date:** 2025-08-01
**Status:** Accepted

## Context

SALLY's frontend serves dispatchers who spend long hours on the platform — often at night or in dimly lit offices. A dark theme is not a cosmetic preference but an ergonomic requirement. The team needed a component library that supports theming natively, integrates well with Tailwind CSS, and does not impose heavy bundle sizes or opaque abstractions.

## Decision

We adopted **Shadcn/ui** (Radix UI primitives + Tailwind CSS) as the component library with a mandatory dark theme policy.

Key design rules:

- **34+ Shadcn/ui components** are used. Plain HTML elements (`<button>`, `<input>`, `<select>`, `<table>`) are never used directly — Shadcn equivalents are required.
- **next-themes** handles theme switching via CSS custom properties.
- **Monochrome palette only:** black, white, and gray. Status indicator colors (red, yellow, green, blue) are the only exceptions, and each must include dark-mode variants.
- **Semantic tokens** are mandatory: `bg-background`, `text-foreground`, `border-border`, etc. Standalone light-only classes (e.g., `bg-white` without a `dark:` counterpart) are prohibited.
- **Mobile-first responsive design** with a minimum 44px touch target for all interactive elements.
- **Sheet vs Dialog convention:** Sheets for create/edit/detail views (4+ fields), Dialogs for quick actions (1-4 fields), AlertDialogs for destructive confirmations only.

**Alternatives considered:**

- **Material UI (MUI):** Rejected — large bundle size, its own styling engine conflicts with Tailwind.
- **Ant Design:** Rejected — opinionated visual style does not match SALLY's design language, and theming requires overriding deeply nested Less variables.
- **Chakra UI:** Rejected — strong theming support but adds a CSS-in-JS runtime.
- **Custom design system:** Rejected — building from scratch would delay delivery and require dedicated design system engineers.

## Consequences

**Positive:**

- Shadcn/ui components are copied into the project (not installed as a dependency), giving full control over customization.
- Radix UI primitives provide accessible, keyboard-navigable components out of the box.
- Tailwind CSS integration means no additional styling runtime — all styles are static CSS at build time.
- The mandatory dark theme policy prevents light-only code from shipping and degrading the experience for night-shift dispatchers.

**Negative:**

- Developers must learn the semantic token vocabulary and always provide dark-mode variants.
- Shadcn/ui updates require manual re-copying of updated component files.
- The monochrome-only constraint limits visual expressiveness — dashboards can feel sparse without careful use of layout and typography.
- Code reviews must enforce the dark theme policy manually; there is no automated lint rule for missing `dark:` variants.
