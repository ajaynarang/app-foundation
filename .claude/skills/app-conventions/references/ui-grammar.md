---
owner: foundation
sources:
  - packages/ui/src/components/page-chrome/index.ts
  - packages/ui/src/components/page-chrome/page-header.tsx#PageHeader
  - packages/ui/src/components/page-chrome/page-toolbar.tsx#PageToolbar
  - packages/ui/src/components/page-chrome/page-section.tsx#PageSection
  - packages/ui/src/components/page-chrome/row-actions.tsx#RowActions
  - packages/ui/src/components/page-chrome/row-actions.slot-guard.tsx
  - packages/ui/src/components/page-chrome/list-row.tsx#ListRow
  - packages/ui/src/components/page-chrome/list-card.tsx#ListCard
  - packages/ui/src/components/page-chrome/identifier.tsx#IDENTIFIER_CLASS
  - packages/ui/src/components/page-chrome/relative-time.tsx#RelativeTime
  - packages/ui/src/components/page-chrome/page-chrome-context.tsx#PageChromeProvider
  - packages/ui/src/components/ui/status-tone.ts#STATUS_TONES
  - packages/ui/src/components/ui/status-tone.ts#toneBadgeClass
  - packages/ui/src/components/ui/status-tone.ts#variantOf
  - packages/ui/src/components/ui/status-badge.tsx#StatusBadge
  - packages/ui/src/styles/globals.css
  - apps/web/src/shared/components/page-chrome/index.ts
  - apps/web/src/shared/providers/PageChromeBridge.tsx
  - apps/web/src/features/__tests__/ui-grammar-guard.test.ts
  - apps/web/src/features/admin/timers/constants.ts#DEADLINE_STATE_VARIANTS
  - apps/web/src/app/settings/members/page.tsx
guards:
  - ui-grammar-guard.test.ts
  - theme-tokens.test.ts
  - row-actions.test.tsx
  - page-toolbar.test.tsx
  - page-actions-menu.test.tsx
  - status-tone.test.tsx
  - relative-time.test.tsx
  - list-row.test.tsx
  - list-card.test.tsx
  - page-chrome-context.test.tsx
  - foundation-boundaries.spec.ts
  - script:type-check
examples:
  - '*_VARIANTS'
---

# UI grammar: page chrome, where actions go, rows and cards, status tones, text and time, dark theme, responsive, microcopy

One chrome, one action grammar, one row and card anatomy, six status tones, so any page, row, card or table reads
the same way. The components carry the rules: `PageHeader`, `PageToolbar`, `RowActions`, `Identifier` and
`RelativeTime` (`@app/ui/components/page-chrome`), `StatusBadge` and `toneBadgeClass` (`@app/ui`). The list kit is in
[`frontend-lists.md`](frontend-lists.md); sheet footers in [`forms-and-sheets.md`](forms-and-sheets.md); how a feature
declares its status map in [`frontend-core.md`](frontend-core.md).

The pre-push hook runs `apps/web/src/features/__tests__/ui-grammar-guard.test.ts` beside `theme-tokens.test.ts`
(contrast of every token pair). The grammar guard has no baseline: a screen that breaks a rule fails the push.

## Rules

### Page chrome

- Every sidebar page uses the one chrome, imported from `@/shared/components/page-chrome` (which re-exports
  `@app/ui/components/page-chrome` and the list kit, and adds `SearchSelect`). Never a hand-rolled
  `<div className="flex … justify-between"><h1>` header. [guard: ui-grammar-guard.test.ts]
- `@app/ui` imports no web-core, no router and no app code. What the chrome needs from the app (timezone,
  formatters, the error reader, `next/link`) comes once through `PageChromeProvider`, passed by `PageChromeBridge`
  in `app/providers.tsx`; with no provider the defaults hold, so a component test needs nothing. Never import app
  code into the kit to reach a formatter: add it to the adapter. [guard: foundation-boundaries.spec.ts,
  page-chrome-context.test.tsx]
- Four zones, top to bottom: the header (`PageHeader`: title, subtitle, an optional settings gear); an optional KPI
  row (`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4`, page-owned, never inside the toolbar or filter row); the
  toolbar (`PageToolbar`: navigation tabs left, the action cluster right); the filter row (`ListFilterRow`), then the
  page's data. [review-only: zone order needs looking]
- Title and subtitle are both required: the subtitle is the page's one-line promise. [guard: script:type-check]
- A page with no content tabs passes `<PageToolbar primaryAction moreActions />` as `PageHeader actions`, so the two
  zones share one row and the cluster order still holds; a page with tabs sets `hasTabs` and renders the toolbar
  below. [review-only: needs reading]
- Every settings and admin page (`app/settings/**`, `app/admin/**` and the feature folders in `SETTINGS_ADMIN_DIRS`)
  renders `PageHeader`; a named section is `PageSection` (`title`, `description`, one `action`); no raw `<h1>` or
  `<h2>`; no `Loader2` as a loading state; no raw `fetch` with a hand-built bearer token. A product adds its own
  settings feature folders to that list. [guard: ui-grammar-guard.test.ts]
- The cluster's order is fixed by the toolbar's slots, read from the right edge: ⋯ More (`moreActions`), the
  primary (`primaryAction`), secondary actions, the view switcher, the group switcher. One filled primary per page;
  a second moves into the menu. [guard: page-toolbar.test.tsx]
- `PageActionsMenu` (⋯ More) holds this page's overflow (Refresh, Export) and is not drawn when empty; the command
  palette is global navigation and search. Never page actions behind Cmd+K, never global navigation behind ⋯.
  [guard: page-actions-menu.test.tsx, page-toolbar.test.tsx]
- Navigation that changes which section or entity you see is underline tabs (`PageTabs`) in the toolbar; a status
  filter over the current list is a text pivot (`StatusPivot`, label and count) in the filter row; a compact,
  mutually exclusive sub-choice is a `SegmentedControl`. `ViewSwitcher` (how data is drawn) and `GroupSwitcher`
  (how it is clustered) are separate controls. [review-only: needs judgement]
- A full-bleed canvas that owns its chrome may opt out of `PageHeader` and `PageToolbar`, with a code comment saying
  why; its controls still sit in one row above the panes, never the same filter twice.
  [review-only: needs judgement]

### Where each action goes

- A row (`ListRow actions`) or a card (`ListCard headerActions`) takes `{ primary, items }`: one small primary, the
  rest behind one horizontal ⋯. A card's action is in its header strip, top-right; never a button in a card's body
  or footer. [guard: row-actions.test.tsx, list-card.test.tsx]
- Those slots accept only `RowActionsProps`, an object, never an element, so a raw `<Button>` in a slot is a type
  error; `packages/ui/src/components/page-chrome/row-actions.slot-guard.tsx` holds the `@ts-expect-error` proofs.
  Never widen the slot to take an element. [guard: script:type-check]
- A table's actions are a `<RowActions items={…} />` in the last column only, a narrow column whose header is an
  `sr-only` "Actions"; when a row has a detail view, the row click opens it. No raw `<Button>` inside a `<TableCell>` or `<li>` on a
  settings or admin screen. [guard: ui-grammar-guard.test.ts]
- A table never sorts on a header click: sort through the filter row's `SortButton`. Non-essential columns hide
  first (`hidden md:table-cell`); counts are right-aligned `tabular-nums`; the key and state cells are
  `whitespace-nowrap` and the title column `w-full max-w-0 truncate`, so nothing overflows at 390 px.
  [review-only: table layout needs looking]
- A destructive action lives in ⋯, last, behind a separator, and always confirms with an `AlertDialog` before it
  acts. When it is the only action, `RowActions` shows it as a visible outline button in `text-critical-text`, never
  the filled destructive pair; give it `ariaLabel` when its label only names the record in context.
  [guard: row-actions.test.tsx, ui-grammar-guard.test.ts]
- A disabled action carries its `disabledReason` (tooltip and screen-reader text); a disabled control with no
  reason is a bug. An action a role may never take is hidden, not disabled. [guard: row-actions.test.tsx]
- A navigating primary is `{ label, href }`, which renders a real link, so middle-click and prefetch work.
  [guard: row-actions.test.tsx]
- Clicks and Enter or Space on an action stop at `RowActions`, so the row's link, toggle or `onClick` never fires
  with it. [guard: row-actions.test.tsx, list-row.test.tsx]
- Every surface that renders a record follows the same grammar, not just list rows: an inline record line or a list
  inside a card gets `RowActions` at the end of its first line, never a row of `<Button>`s.
  [review-only: the guard scans settings and admin screens only]

### Reveal on hover

- Inside a list row or table row (`li`, `tr`, `[role=row]`), `RowActions` is invisible until the row is hovered or
  holds focus, then fades in; on a touch screen, with its menu open, while busy and on the current row it stays
  shown. Outside a row (a sheet, a toolbar, a detail card) it is always shown. The rule is CSS keyed on
  `data-row-actions` in `packages/ui/src/styles/globals.css`, so a screen gets it by using `RowActions`.
  [guard: row-actions.test.tsx]
- `reveal="always"` only where the action is the screen's point, with a comment saying why. The row must still say
  what matters (status, owner, size) without its actions. [review-only: needs judgement]
- Any other control hidden until hover (`opacity-0 group-hover:opacity-100`) also shows on focus
  (`group-focus-within:opacity-100` or `focus-visible:opacity-100`) and on touch (`[@media(hover:none)]:opacity-100`),
  on the same line. [guard: ui-grammar-guard.test.ts]

### Row and card anatomy

- A `ListRow` has fixed slots: `leading` (the key column, monospace, fixed width; `leadingTone="meta"` for a
  timestamp), `primary` (truncates), `secondary` (one muted line), `trailing` (badges and meta, right-aligned; hide
  pieces with `hidden sm:inline-flex`), `actions`, and `expanded` (content under the row). `href` makes the whole
  surface one link; `onToggle` makes the title the expand toggle (`aria-expanded`, `aria-controls`); `isFocused`
  marks the current row (left accent, tint, `aria-current`). One rhythm everywhere (`min-h-[48px]`, `px-[12px]`, `py-2`,
  `gap-3`), and a hover that tints, never moves. [guard: list-row.test.tsx]
- A `ListCard` has a header strip (`icon`, `title`, `status`, `headerActions`, `description` under the name), a body
  (`children`: at most three muted lines, no buttons) and a metadata `footer` (middots between items, counts
  `tabular-nums`, no buttons). `href` or `onSelect` make the card the target; header actions stay clickable on their
  own. Cards on a grid row are the same height; `columns` is 1, 2 or 3. [guard: list-card.test.tsx]

### Status tones

- A status is a `StatusBadge` with a tone, never a raw `Badge`: no `variant` keyed on a status, no raw enum text, no
  `variant="muted"` chip and no `bg-muted` plus `text-muted-foreground` chip (4.36:1). A fact that is not a state (an
  age, a tag) is a `neutral` tone too. [guard: ui-grammar-guard.test.ts, status-tone.test.tsx]
- Six tones, six meanings: `neutral` not started (Draft, Pending), `info` moving (Active, Running), `warning` waiting
  on a person (Awaiting review, Blocked), `success` done well (Done, Approved), `danger` stopped (Failed, Cancelled),
  `muted` retired (Archived, Merged). The classes are `STATUS_TONES`; neutral keeps a border so it does not vanish on
  a card. [guard: status-tone.test.tsx]
- Each feature maps its enum to `{ label, tone }` (`StatusVariant`) in its `constants.ts`, never to a class string
  (no `*_VARIANTS` map of classes), and adds the map to `STATUS_MAPS` in the guard. One label wears one tone on every
  screen; a label spelled the same with another meaning is listed with its reason. A value the map does not know
  renders through `variantOf` as a neutral label of itself. [guard: ui-grammar-guard.test.ts, status-tone.test.tsx]
- A label is always text; an icon inside a badge is decorative, and colour is never the only signal.
  [review-only: needs looking]

### Text, time and identifiers

- A human key (a ticket number, a slug) renders with `Identifier` (`IDENTIFIER_CLASS`: monospace, medium weight,
  `text-brand-text`); `href` makes it a link. Every key in a column wears it, never muted grey and never
  `text-primary`. [review-only: no spec finds a key drawn without Identifier]
- A moment renders with `<RelativeTime iso prefix? />`: "5m ago" or "in 7d", the full timestamp on hover, a
  `<time dateTime>` underneath. Never a bare `formatRelativeTime` or `timeAgo` (the guard scans settings and admin
  screens; review the rest), and never a `title=` attribute for a timestamp. Other dates go through
  `useFormatters()`. [guard: ui-grammar-guard.test.ts, relative-time.test.tsx, lint:no-restricted-syntax]
- People are `text-xs text-muted-foreground`; counts are `tabular-nums`. An icon in a button is a lucide `h-4 w-4`, in
  a badge or chip `h-3 w-3`. [review-only: needs looking]
- The root font size is 13 px (`packages/ui/src/styles/globals.css`), so Tailwind steps scale together; match the
  step, not a pixel figure. The `ListRow` rhythm is the one pixel-exact value. [review-only: needs looking]

### Colour and dark theme

- Dark theme always works: a surface wears a theme token (`bg-background`, `bg-card`, `bg-muted/50`), text wears
  `text-foreground` or `text-muted-foreground`, a border `border-border`, a hover `hover:bg-muted/50`. No raw palette
  class (paired with `dark:` or not) and no hex class, in `apps/web/src`, `packages/ui/src` and web-core.
  [guard: ui-grammar-guard.test.ts]
- Tinted text wears the `-text` token (`text-caution-text`, `text-success-text`, `text-info-text`,
  `text-critical-text`); the fill hues read 1.7 to 2.8:1 on their tint in light theme and are for fills and icons
  only. Every text token clears WCAG AA in both themes. [guard: theme-tokens.test.ts, ui-grammar-guard.test.ts]

### Responsive and accessible

- Mobile first, with `sm:`, `md:` and `lg:`; check 375, 768 and 1440 px in both themes. A grid is one column on a
  phone (`grid grid-cols-1 md:grid-cols-2`); a table hides non-essential columns. [review-only: needs looking]
- Touch targets are at least 44 by 44 px (`h-11 w-11` on an icon button); every icon-only button has `aria-label`
  and a tooltip; every form control has a `Label`; hidden controls use opacity, never `display: none`, so they stay
  in the tab order. [review-only: no accessibility spec runs]

### Microcopy

- Every page header's title and subtitle read in a casual, confident voice: a colleague explaining the screen, not
  a manual. Titles are one or two words and match the sidebar label. A subtitle is one line, about 60 characters, no
  closing period unless it is a sentence. [review-only: copy needs reading]
- Five techniques for a subtitle: drop the verb (never start with Manage, Configure, View or Monitor); speak to the
  outcome ("Every deadline the platform is holding — and whether it fired"); use the person's words ("What needs
  your attention"); keep it short ("Invoices out, payments in"); one thought, then the kicker after an em dash.
  [review-only: copy needs reading]
- Empty and error copy follows the same voice: an empty state says what will appear and how it gets there; an
  error title says what could not load ("Couldn't load the timers."), never a code. [review-only: copy needs
  reading]

## Recipe: a page's chrome and a table row's actions

A page with no tabs, so the one primary action sits in `PageHeader actions`; a status as a tone; one destructive row
action that confirms, carries a reason when disabled and names its record for assistive tech. The invite button
drops its text below `sm`, so it carries an `aria-label` that repeats the visible text (a phone still hears its
name). Trimmed from
`apps/web/src/app/settings/members/page.tsx`:

```tsx
<PageHeader
  title="Members"
  subtitle="Who's on your team and what they can do"
  actions={
    <Button onClick={() => setInviteOpen(true)} size="sm" aria-label="Invite Staff Member">
      <UserPlus className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">Invite Staff Member</span>
    </Button>
  }
/>

<TableHead className="w-[1%]">
  <span className="sr-only">Actions</span>
</TableHead>

<TableCell>
  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
</TableCell>
<TableCell className="hidden md:table-cell text-muted-foreground">
  {member.lastLoginAt ? <RelativeTime iso={member.lastLoginAt} /> : 'Never'}
</TableCell>
<TableCell className="text-right">
  <RowActions
    items={[
      {
        label: 'Deactivate…',
        ariaLabel: `Deactivate ${memberName}`,
        destructive: true,
        disabled: isCurrentUser,
        disabledReason: isCurrentUser ? 'You cannot deactivate yourself.' : undefined,
        onSelect: () => setConfirmAction({ type: 'deactivate', userId: member.userId, name: memberName }),
      },
    ]}
  />
</TableCell>
```

1. `PageHeader` with a title that matches the sidebar and a subtitle written by the microcopy rules.
2. Actions: one primary in `PageHeader actions` (a `PageToolbar` there once the page also has overflow or a
   secondary action, so the slots fix the order). With tabs, render `PageToolbar tabs={…}` below the header and set
   `hasTabs`.
3. Each status as a `StatusBadge` from the feature's `{ label, tone }` map; add the map to `STATUS_MAPS` in the
   grammar guard.
4. Row actions through `RowActions`: the destructive item last, its `onSelect` opening an `AlertDialog` (the page's
   `confirmAction` state), never acting itself; a disabled item with its reason.
5. Keys through `Identifier`, moments through `RelativeTime`, dates through `useFormatters()`.
6. Look at 375, 768 and 1440 px in both themes; run the web guards (`ui-grammar-guard.test.ts`,
   `theme-tokens.test.ts`).

## Flag in review

- A page with no subtitle, a second filled primary, or actions placed outside the toolbar's slots.
- Page actions behind Cmd+K, or global navigation behind ⋯.
- A status as a raw `Badge`, a status map of class strings, or the same label in two tones.
- A raw palette or hex class, or a fill hue used as text.
- A second visible button on a row, a button in a card's body or footer, or a header-click sort.
- A destructive action that acts on the first click, or a disabled control with no reason.
- A hover-only control, or a row that only makes sense through its action labels.
- A bare relative time with no hover timestamp, or a key in muted grey.
- A subtitle that starts with "Manage".
