# Design — @-mention entity picker for Sally AI chat

**Date:** 2026-06-08
**Status:** Approved (design + prototype), pending implementation plan
**Author:** Sally Product & Engineering
**Prototype:** `.screenshots/mention-picker-prototype.html` (approved)

---

## 1. Problem

A dispatcher asking Sally about a specific entity ("show me the detail on load …") has to know the
machine identifier first. Load numbers, settlement numbers, VINs — nobody remembers those. They
remember _"the Walmart Chicago reefer"_ or _"Mike's truck"_ or _"that overdue Walmart invoice."_
Today the only way to reference an entity in chat is to type its exact number, which means leaving
the chat to go find it.

We want the user to **find and insert an entity the way they actually remember it** — by customer,
PO/ref, lane, driver name, unit number — and to **recognize it on sight** from human context, not an
opaque internal number, so they can confidently ask Sally about it.

## 2. Goal (and non-goals)

**Goal:** Typing `@` in the Sally AI chat input opens a searchable, grouped picker over all the
entities a dispatcher references (loads, drivers, customers, invoices, settlements, vehicles, trips,
trailers, recurring lanes). Each result shows a recognizable two-line row. Picking one inserts a
clean, human-readable reference into the message as **plain text**. The user sends a normal sentence;
Sally AI and its MCP tools resolve it exactly as they do today.

**Non-goals (explicitly out of scope):**

- No structured payload / `attachedEntities` field. The message stays plain text. (See §9.)
- No contentEditable / rich-text editor / inline pills inside the textarea. The existing shadcn
  `<Textarea>` stays. (See §9.)
- No second search backend. We reuse and **enrich** the one unified `/search` endpoint that already
  powers ⌘K and the home search — one source of truth.
- No change to how Sally AI / MCPs interpret messages. The `@` is a **UI affordance for the user
  only** — it never reaches the model.
- **Documents** (queried from a parent entity) and **Alerts** (transient, not a referent) are
  intentionally excluded.

## 3. The critical constraint — `@` must never pollute the message

The `@` is sugar for _the user_, not content for the AI. If `@LD-2026-001` ever reached Sally AI as
literal text, the model could try to interpret the `@` and respond "I couldn't find @LD-2026-001."
That is impossible by construction:

- `@` only ever opens the **picker**. It is a trigger character, not message content.
- On select, the `@` + the half-typed query fragment are **replaced** by clean reference text.
- If the user types `@` and then keeps typing prose without picking anything (or presses Escape),
  **nothing is inserted and nothing is stripped** — their literal text is left exactly as typed.
  The picker is purely additive; it never mangles what the user wrote.
- The message is sent through the existing `sendMessage(text, 'text')` path with no new fields.

Net: Sally AI receives `"show me detail on load LD-2026-001 (PO-88421)"` — a sentence a human could
have typed. No `@`, no token, no structured sidecar.

## 4. Architecture overview

Two independent pieces:

### 4a. Backend — enrich the single unified search

`apps/backend/src/domains/fleet/search/search.service.ts` is the one search behind `GET /search`,
shared by ⌘K, home search, and the new `@` picker. We **(i)** enrich the existing four types with
the relations/fields that make rows recognizable, **(ii)** add lane + driver-name matching to loads,
and **(iii)** add five new entity types. Because the endpoint is shared, ⌘K and home search inherit
the richer rows **for free** — one change, three surfaces improve.

### 4b. Frontend — the `@` picker in `SallyInput`

`apps/web/src/features/platform/sally-ai/components/SallyInput.tsx` gains `@`-trigger detection, a
shadcn `Command`/`Popover` dropdown fed by the same `searchEntities()` function, and an
insert-clean-text-on-select handler. **Panel (chat) variant only** — the home variant already owns
its own search/navigation dropdown and must not collide with it.

```
User types "@walmart" ─▶ detect @-fragment ─▶ searchEntities("walmart")  (debounced, server)
                                                     │
                              ┌──────────────────────┘
                              ▼
                     grouped Command dropdown (no row icons)
                     LOADS · CUSTOMERS · INVOICES · …
                     each row: recognizable 2-line content
                              │ pick
                              ▼
            replace "@walmart" with "load LD-2026-001 (PO-88421)"
                              │ send
                              ▼
            sendMessage("show me detail on load LD-2026-001 (PO-88421)", 'text')
                              │
                              ▼
                    Sally AI + MCPs (unchanged)
```

## 5. Entities & row content (the UX core)

Nine entity types. Every row is **two lines, no leading icon** (the group heading already signals
type): a recognizable **primary** line + a **context** line built from the relations a human thinks
in. **A load number, wherever it appears — including inside another entity's context line — always
follows the `load# (PO/ref)` pattern when a ref exists.**

| Group           | Primary line             | Context line                                               |
| --------------- | ------------------------ | ---------------------------------------------------------- |
| Loads           | `LD-2026-001 · PO-88421` | `Walmart · Chicago, IL → Dallas, TX · IN_TRANSIT`          |
| Drivers         | `Mike Rodriguez`         | `Unit 204 · ACTIVE`                                        |
| Customers       | `Walmart Distribution`   | `Bentonville, AR · SHIPPER`                                |
| Invoices        | `INV-8821`               | `Load LD-2026-001 (PO-88421) · Walmart · $4,200 · OVERDUE` |
| Settlements     | `STL-2026-014`           | `Mike Rodriguez · Jun 1–15 · $3,100 net · PENDING`         |
| Vehicles        | `Unit 204`               | `2022 Peterbilt 389 · Mike Rodriguez · ASSIGNED`           |
| Trips           | `TRIP-0308-001`          | `Mike Rodriguez · 5 loads · IN_PROGRESS`                   |
| Trailers        | `TR-28`                  | `Reefer · 53ft · on Unit 204`                              |
| Recurring Lanes | `Walmart Denver`         | `Chicago → Denver · Dry Van · $2,800 · ACTIVE`             |

Status is a small colored pill on the context line (steel-blue/caution/critical/ok per the Sally
palette — no green/orange beyond the allowed status set).

## 6. Backend detail — search.service.ts

The `type` union widens to all nine; `search()` runs every branch in the existing `Promise.all` and
concatenates. All queries stay tenant-scoped (`tenantId: tenantDbId`), `take: limit`, 2-char minimum.
Field/relation names below are verified against `schema.prisma`.

**Loads (enrich matching + keep rich display).** Add lane + driver-name to the OR; keep current
display (route already built from origin/dest cities):

```ts
where: { tenantId, OR: [
  { loadNumber:      { contains: query, mode: 'insensitive' } },
  { referenceNumber: { contains: query, mode: 'insensitive' } },  // PO/ref
  { customerName:    { contains: query, mode: 'insensitive' } },
  { originCity:      { contains: query, mode: 'insensitive' } },   // lane
  { destinationCity: { contains: query, mode: 'insensitive' } },   // lane
  { driver: { name:  { contains: query, mode: 'insensitive' } } }, // "Mike's load"
]}
```

- label: `loadNumber` + `·` + `referenceNumber` when present (the load#+ref pattern).
- description: `${customerName} · ${route} · ${status}`.
- href: `/dispatcher/loads?open=${loadNumber}` · insertion text: `load LD-… (PO-…)` / `load LD-…`.

**Drivers (enrich display).** Include `assignedVehicle.unitNumber`:

- description: `Unit ${assignedVehicle.unitNumber} · ${status}` · insertion: `driver <name>`.

**Customers (enrich display).** Add `customerType` to description:

- description: `${city}, ${state} · ${customerType}` · insertion: `customer <companyName>`.

**Invoices (enrich display — the key fix).** Include `load` + `customer`:

- description: `Load ${load.loadNumber}${load.referenceNumber ? ' (' + ref + ')' : ''} · ${customer.companyName} · ${formatCents(totalCents)} · ${status}`.
- insertion: `invoice <invoiceNumber>`.

**Settlements (new — the key fix).** Match `settlementNumber`; include `driver`:

- description: `${driver.name} · ${period} · ${formatCents(netPayCents)} net · ${status}`.
- href: `/dispatcher/pay?open=${settlementNumber}` · insertion: `settlement <settlementNumber>`.

**Vehicles (new).** Match `unitNumber|make|model|licensePlate|vin`; include `assignedDriver`:

- label: `Unit ${unitNumber}`; description: `${year} ${make} ${model} · ${assignedDriver?.name} · ${status}`.
- href: `/dispatcher/fleet?open=${vehicleId}` · insertion: `unit <unitNumber>`.

**Trips (new).** Match `tripId`; include `driver`, `loadCount`:

- description: `${driver?.name} · ${loadCount} loads · ${status}`.
- insertion: `trip <tripId>`.

**Trailers (new).** Match `unitNumber|make|model`; show equipment + assignment:

- label: `${unitNumber}`; description: `${equipmentType} · ${status}` (+ tractor when assigned).
- insertion: `trailer <unitNumber>`.

**Recurring Lanes (new).** Match `name|laneId|customerName|originCity|destinationCity`:

- label: `${name}`; description: `${origin} → ${destination} · ${commodityType} · ${formatCents(rateCents)} · ${status}`.
- insertion: `lane "<name>"`.

**Currency/period formatting** lives in a small backend helper (cents → `$X,XXX`, dates → `Jun 1–15`)
co-located with the service — not duplicated per branch.

**Tests (backend TDD):** for each new/edited branch — match by each searchable field; relation-include
shape is correct; tenant scoping (no cross-tenant leakage); `limit` cap; `< 2` chars → `[]`; load
label/description carry the `load# (ref)` pattern; invoice/settlement context shows the related
driver/load.

## 7. Frontend detail — the `@` picker

### 7.1 Trigger detection (pure helper `getMentionFragment(value, caret)`)

A mention is the run of non-whitespace chars immediately after an `@` that begins at a word boundary
(string start or preceded by whitespace), with the caret inside that run. Same word-boundary guard
tower's composer uses, so `@` inside an email/handle does not trigger.

```
"show me @wal|"      → { at, query:"wal" } → picker open
"email me@host.com"  → null (mid-word @)    → picker closed
"show me @wal more|" → null (space after)   → picker closed
"show me @|"         → { at, query:"" }      → picker open (bare @)
```

Returns `{ at, query } | null`; `null` ⇒ picker closed. State: `mentionQuery`.

### 7.2 Search (`useMentionSearch(query)`)

Thin `useQuery` wrapper over `searchEntities()` from `@/shared/lib/search`: 250ms debounce (matching
⌘K), `enabled` only when query ≥ 2 chars, `keepPreviousData` to avoid flicker. Always a server query
(loads scale to thousands — never an in-memory filter). Identical endpoint/result shape as ⌘K.

### 7.3 Rendering — shadcn only, grouped, **no row icons**

shadcn `Command` inside a `Popover` anchored above the input (`StopLocationPicker` is the in-repo
reference: `shouldFilter={false}`, our own query drives results, `CommandGroup` per type).

- **Grouped by type** — one `CommandGroup` per non-empty type, uppercase heading in the §5 order.
- **No leading entity icons** — clean two-line rows (primary + muted context) per §5; status pill on
  the context line. Group heading signals type; a per-row icon is redundant noise.
- **Keyboard:** ↑/↓ across all rows (flattened), Enter selects highlighted, Escape closes without
  inserting. Interception is gated on `mentionQuery !== null`; otherwise Enter sends as today.
- **Loading:** a few `Skeleton` rows at row height (never a spinner, never null).
- **Empty (≥2 chars, no results):** `CommandEmpty` → "No matches."
- **Dark mode + a11y:** semantic tokens only; cmdk listbox/`aria-activedescendant`; visible selection.

### 7.4 Insert-on-select (`buildMentionText(result)` — pure)

Replace the `@fragment` span (from `@` to caret) with the entity's insertion text + trailing space,
then place the caret after it and close the picker. Insertion text is derived from result fields, not
the decorated `label`. `buildMentionText` is the single place that knows the wording:

| Type       | Insertion text                                     |
| ---------- | -------------------------------------------------- |
| load       | `load LD-2026-001 (PO-88421)` / `load LD-2026-001` |
| driver     | `driver Mike Rodriguez`                            |
| customer   | `customer Walmart Distribution`                    |
| invoice    | `invoice INV-8821`                                 |
| settlement | `settlement STL-2026-014`                          |
| vehicle    | `unit 204`                                         |
| trip       | `trip TRIP-0308-001`                               |
| trailer    | `trailer TR-28`                                    |
| lane       | `lane "Walmart Denver"`                            |

The frontend needs the load `referenceNumber` to build `load LD-… (PO-…)`. The search result already
encodes it in `id`/`label`; `buildMentionText` parses the canonical number + ref from the structured
result fields (we expose `referenceNumber` on load results rather than regex-ing the label).

### 7.5 Discoverability — hint the user to type `@`

The `@` affordance must be visible, not hidden. Two low-noise cues (panel variant only):

- **Placeholder** carries it: `Ask Sally anything…  ·  @ to mention a load, driver, invoice…`
  (appended to the existing per-role panel placeholder, so it shows on an empty input).
- **Inline cue** in the existing bottom control row, beside the Ask/voice controls: a muted
  `@ mention` micro-label (≤ one short phrase, `text-2xs text-muted-foreground`). It stays visible
  after the user starts typing (when the placeholder is gone), so the affordance is always
  discoverable. It is presentational only — not a button.

Keep both subtle: the hint informs, it must not crowd the composer or compete with the send button.

### 7.6 Variant scoping

Runs in the **panel** variant only (`variant === 'panel'`). Home keeps its existing `SearchDropdown`

- `matchAction`. Every new effect/handler guards on `!isHome`, mirroring the file's pattern.

## 8. Components / units (each independently understandable)

| Unit                                          | Responsibility                                                          | Depends on                       |
| --------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- |
| `search.service.ts` (enrich + 5 new branches) | One server search over all 9 entities, rich rows                        | Prisma                           |
| `useMentionSearch(query)`                     | Debounced, gated entity search for the picker                           | `searchEntities`, TanStack Query |
| `getMentionFragment(value, caret)`            | Derive the active `@`-fragment (or null)                                | — (pure)                         |
| `buildMentionText(result)`                    | Map a result → clean insertion string                                   | — (pure)                         |
| `MentionPicker`                               | Grouped shadcn `Command` dropdown (no icons), 2-line rows, keyboard nav | `@sally/ui`, results             |
| `SallyInput` (wiring)                         | Detect fragment, host picker, apply insertion                           | the four units above             |

Pure helpers + the search hook are unit-tested; `MentionPicker` + `SallyInput` wiring are
browser-verified (per the project's no-UI-TDD policy).

## 9. Alternatives considered (and rejected)

- **Structured `attachedEntities` payload + backend DTO/prompt change.** More "correct" grounding,
  but adds backend surface and a serialization contract for zero functional gain — the MCPs already
  resolve entities from plain text. Rejected for KISS/YAGNI.
- **Inline pills inside the textarea (Slack/Notion style).** Best feel, but requires replacing the
  shadcn `<Textarea>` with contentEditable (hand-managed caret/backspace/paste/IME/auto-grow) or a
  heavy editor dep — against "shadcn only," against KISS, and it reintroduces a serialize step that
  risks the §3 pollution. Plain-text insertion has none of that risk. Possible isolated future
  upgrade.
- **Match tower's composer exactly.** Tower filters a prefetched array of the current driver's active
  load **numbers** — can't find by customer/PO/lane and doesn't scale. Rejected for the unified server
  search.
- **Separate richer search just for the picker.** Would isolate blast radius from ⌘K/home but
  duplicate logic and diverge from the single-search goal. Rejected — we enrich the shared endpoint so
  all three surfaces improve together.

## 10. Risks

- **Search performance** — more `contains` branches + relation includes. Bounded by `take: limit`,
  2-char minimum, and per-type parallelism. Acceptable at current scale; revisit with indexes if a
  branch is slow.
- **Keyboard interception conflicts** — picker must hand arrows/Enter/Escape back when closed.
  Mitigated by gating interception on `mentionQuery !== null`.
- **Caret math on insert** — must use live `selectionStart`, not a stale value. Mitigated by the pure
  `getMentionFragment` helper + a browser verification pass.
- **Shared-search blast radius** — enriching the endpoint changes ⌘K/home rows too. This is intended
  and a net improvement; verify those two surfaces still render correctly after the change.

## 11. Success criteria

- Typing `@walmart` in the Sally chat panel shows grouped results (no icons) within ~250ms, with
  recognizable two-line rows across Loads/Customers/Invoices.
- Invoice/settlement rows show their related load/driver + amount + status — not a bare number.
- Every load reference (including inside an invoice row) shows `load# (PO/ref)` when a ref exists.
- Picking a load inserts `load <number> (<ref>)` (or `load <number>`) and the `@` fragment is gone.
- The sent message contains **no `@`** and Sally AI/MCP resolves the entity normally.
- Typing `@` then continuing to type prose (no pick) leaves the literal text untouched.
- ⌘K and home search now also return the five new types with the enriched rows.
- The empty composer hints the user to type `@` (placeholder + persistent inline `@ mention` cue).
- Backend unit tests for all new/edited branches pass; type-check + web build green.
