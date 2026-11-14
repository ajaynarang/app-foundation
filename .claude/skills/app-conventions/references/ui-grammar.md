---
owner: foundation
status: interim
pending: F1
sources:
  - packages/ui/src/components/page-chrome/index.ts
  - packages/ui/src/components/page-chrome/page-header.tsx
  - packages/ui/src/components/page-chrome/row-actions.tsx
  - packages/ui/src/components/ui/status-tone.ts
  - packages/ui/src/styles/globals.css
  - apps/web/src/shared/components/page-chrome/index.ts
  - apps/web/src/shared/providers/PageChromeBridge.tsx
  - apps/web/src/features/__tests__/ui-grammar-guard.test.ts
  - apps/web/src/shared/components/page-chrome/__tests__/theme-tokens.test.ts
guards:
  - ui-grammar-guard.test.ts
  - theme-tokens.test.ts
  - row-actions.test.tsx
  - status-tone.test.tsx
  - foundation-boundaries.spec.ts
  - script:type-check
---

# UI grammar: page chrome, where actions go, rows and cards, status tones, dark theme, responsive, microcopy

Moved from the old frontend skill; condensed with its recipe in its finish pull request. The status map itself is in
[`frontend-core.md`](frontend-core.md); the list kit in [`frontend-lists.md`](frontend-lists.md); sheet actions in
[`forms-and-sheets.md`](forms-and-sheets.md).

The pre-push hook runs `apps/web/src/features/__tests__/ui-grammar-guard.test.ts` beside `theme-tokens.test.ts`
(contrast of every token pair). The grammar guard has no baseline: a screen that breaks a rule fails the push.

## Rules

### Page chrome

- Every sidebar page uses the one chrome, imported from `@/shared/components/page-chrome` (which re-exports
  `@app/ui/components/page-chrome` and the list kit, and adds `SearchSelect`). Never a hand-rolled
  `<div className="flex … justify-between"><h1>` header. [guard: ui-grammar-guard.test.ts]
- `@app/ui` imports no web-core, no router and no app code; what the chrome needs from the app (timezone, formatters,
  the error reader, `next/link`) is passed once by `PageChromeBridge` in `app/providers.tsx`.
  [guard: foundation-boundaries.spec.ts]
- Four zones, top to bottom: the header (`PageHeader`: a title and a subtitle, an optional settings gear), an optional
  KPI row (`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4`, page-owned), the toolbar (`PageToolbar`: navigation tabs
  left, the action cluster right), the filter bar (`StatusPivot` and `ListFilterRow`: search left, filters middle, sort
  right), then the page's data. [review-only: zone order needs looking]
- Title and subtitle are both required: the subtitle is the page's one-line promise.
  [guard: script:type-check]
- Every settings and admin page (`app/settings/**`, `app/admin/**` and the feature folders in `SETTINGS_ADMIN_DIRS`)
  renders `PageHeader`; a section heading is `PageSection`; no raw `<h1>` or `<h2>`; no `Loader2` as a loading state;
  no raw `fetch` with a hand-built bearer token. A product adds its own settings feature folders to that list.
  [guard: ui-grammar-guard.test.ts]
- The right cluster's order is fixed, right to left: `⋯ More`, the primary action, a secondary action, the view
  switcher, the group switcher. One primary action per page. [review-only: order needs looking]
- `PageActionsMenu` (⋯ More) holds this page's overflow (Refresh, Export); the command palette is global navigation
  and search. Never page actions behind Cmd+K, never global navigation behind ⋯.
  [review-only: no spec tells a page action from a global one]
- Navigation that changes which section or entity you see is underline tabs (`PageTabs`) in the toolbar; a status
  filter over the current list is a text pivot (`StatusPivot`, label and count) in the filter bar; a compact
  mutually exclusive sub-choice is a `SegmentedControl`. `ViewSwitcher` (how data is drawn) and grouping (how it is
  clustered) are separate controls. [review-only: needs judgement]
- A full-bleed canvas that owns its chrome may opt out of `PageHeader` and `PageToolbar`, with a code comment saying
  why; its controls still sit in one row above the panes, never the same filter twice.
  [review-only: needs judgement]

### Rows, actions and states

- A row's actions are `RowActions`: one visible primary, the rest behind ⋯, a destructive item last (confirmed by an
  `AlertDialog` before it acts), a disabled item with its `disabledReason`. No raw `<Button>` inside a `<TableCell>`
  or `<li>` on a settings or admin screen. [guard: row-actions.test.tsx, ui-grammar-guard.test.ts]
- A file that renders a list and reads `isLoading` also renders `ListErrorState`; an `Alert` is never an empty state
  (`PageEmptyState`) or a read's error state. [guard: ui-grammar-guard.test.ts]
- A control hidden until hover (`opacity-0 group-hover:opacity-100`) also shows on focus
  (`group-focus-within:opacity-100` or `focus-visible:opacity-100`) and on touch (`[@media(hover:none)]:opacity-100`),
  on the same line. `RowActions` does this itself. [guard: ui-grammar-guard.test.ts]
- A human key renders with `Identifier`; a relative time with `RelativeTime`. [guard: ui-grammar-guard.test.ts]

### Status and colour

- A status never rides a raw `Badge` (no `variant` keyed on a status, no raw enum text); no `variant="muted"` chip and
  no `bg-muted` plus `text-muted-foreground` chip (4.36:1); no `*_VARIANTS` map of class strings. A status is a
  `StatusBadge` with a tone. [guard: ui-grammar-guard.test.ts, status-tone.test.tsx]
- Dark theme always works: a surface wears a theme token (`bg-background`, `bg-card`, `bg-muted/50`), text wears
  `text-foreground` or `text-muted-foreground`, a border `border-border`, a hover `hover:bg-muted/50`. No raw palette
  class (paired with `dark:` or not) and no hex class, in `apps/web/src`, `packages/ui/src` and web-core.
  [guard: ui-grammar-guard.test.ts]
- Tinted text wears the `-text` token; the fill hues read 1.7 to 2.8:1 on their tint in light theme and are for fills
  and icons. Every text token clears WCAG AA in both themes. [guard: theme-tokens.test.ts, ui-grammar-guard.test.ts]

### Responsive and accessible

- Mobile first, with `sm:`, `md:` and `lg:`; check 375, 768 and 1440 px in both themes. A grid is one column on a
  phone (`grid grid-cols-1 md:grid-cols-2`); a table hides non-essential columns. [review-only: needs looking]
- Touch targets are at least 44 by 44 px (`h-11 w-11` on an icon button); every icon-only button has `aria-label`;
  every form control has a `Label`; colour is never the only signal (a status has text and a tone).
  [review-only: no accessibility spec runs]

### Microcopy

- Every page header's title and subtitle read in a casual, confident voice: a colleague explaining the screen, not a
  manual. Titles are one or two words and match the sidebar label. A subtitle is one line, about 60 characters, no
  closing period unless it is a sentence. [review-only: copy needs reading]
- Five techniques for a subtitle: drop the verb (never start with Manage, Configure, View, Monitor); speak to the
  outcome; use the person's words ("What needs your attention"); keep it short ("Invoices out, payments in"); one
  thought, then the kicker after an em dash. [review-only: copy needs reading]

## Flag in review

- A page with no subtitle, a second primary action, or the cluster out of order.
- A status as a raw `Badge`, or a role drawn with a status tone.
- A raw palette or hex class, or a fill hue used as text.
- A hover-only control.
- A subtitle that starts with "Manage".
