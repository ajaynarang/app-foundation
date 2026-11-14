---
owner: foundation
sources:
  - tools/guards/convention-gate.mjs#RULES
  - tools/guards/convention-gate.baseline.json
guards:
  - gate:file-size
  - gate:empty-catch
  - gate:http-plain-error
  - foundation-boundaries.spec.ts
  - domain-boundaries.spec.ts
examples:
  - Util
  - NotImplementedException
  - SCREAMING_SNAKE_CASE
  - pendingCount
  - handleX
  - onX
---

# Code quality: the reasoning behind the size, naming, comment and DRY rules

The index ([`SKILL.md`](../SKILL.md)) carries the short form. This file is the long form: why each rule exists and
where judgement wins over a number. These rules hold for every layer; they override convenience and override
copying existing code that breaks them. When you touch code that breaks one, improve it while you are there.

## Rules

### Design

- One class, one reason to change. A class name with "and", or `Manager`, `Helper`, `Util` without a sharper noun,
  is doing too much: split or rename it. [review-only: whether two concerns are one is judgement]
- Extend by registering, not by branching: add an entry to a registry or a provider to a module instead of an
  `if (type === 'x')` branch in existing code. The event registry, the MCP tool registry and the queue handler
  tokens are the examples. [review-only: no machine can tell a new branch from a needed one]
- A subtype keeps its supertype's contract: no `NotImplementedException` in an override, no silently narrowed input
  or widened output. [review-only: contract substitution needs reading]
- A client depends only on what it uses. Injecting a whole service to call one finder is a sign a thinner interface
  is missing. [review-only: needs judgement]
- Depend on abstractions at module boundaries: constructor injection, never `new SomeService()` in business code.
  [review-only: no spec scans for manual construction]
- Straightforward over clever. No speculative generics, no hidden control flow (deep decorator chains, implicit
  globals, dynamic dispatch by string), explicit `if` and `return` over short-circuits that need decoding.
  [review-only: readability is judgement]
- Extract at the third occurrence with the same intent. Two similar blocks with different intents stay apart; a
  shared helper couples what wants to drift. [review-only: intent is judgement]
- YAGNI: no feature, flag, config knob, abstraction or parameter "for the future". [review-only: needs judgement]
- Inputs are not mutated unless the method says so; prefer `readonly` fields; push I/O to the edges so the middle is
  pure and easy to test. [review-only: needs judgement]
- Composition over inheritance. Classes exist for dependency injection, rarely for type hierarchies.
  [review-only: needs judgement]

### Size

- A backend or package source file over 800 lines, or a web `.tsx` over 300, fails the gate. Existing hits are in
  the baseline and may only shrink. [guard: gate:file-size]
- Targets below the ceiling: a file at most 500 lines, a method at most 60 (soft ceiling about 100), a web component
  at most 150 lines, a hook at most 50. Split along a responsibility seam, never mechanically: a switch dispatcher, a
  DTO-to-row mapper, a flat orchestration method or a query builder may be long. [review-only: the target is a
  prompt to look, not a hard limit]

### Naming

- Classes are `PascalCase` nouns; methods are `camelCase` verbs, and a boolean method starts with `is`, `has` or
  `should`. [review-only: names need reading]
- A file is `kebab-case.role.ts` and always carries its role suffix (`.service.ts`, `.controller.ts`,
  `.processor.ts`, `.dto.ts`, `.serializer.ts`, `.module.ts`). Match the role; do not invent a suffix.
  [review-only: no spec checks suffixes]
- Constants are `SCREAMING_SNAKE_CASE`, exported from the module that owns the concept. [review-only: needs reading]
- Variables say what they hold: `pendingCount`, not `count` where it is ambiguous. `data`, `info`, `obj` only where
  the context is unambiguous (a DTO, an event payload). No Hungarian notation, no abbreviations that are not
  universal. [review-only: needs reading]
- Schema names (fields, foreign keys, `*Number` identifiers, `<verb>At` timestamps, `*Cents` money) follow
  `docs/standards/column-naming.md`. [guard: schema-conventions.spec.ts]

### Comments

- Default to no comment. Write one when the why is not obvious: a workaround for a named bug, a subtle invariant, a
  regulatory constraint, a performance trick. Never narrate what the code does; never leave commented-out code; JSDoc
  only at public boundaries. [review-only: needs reading]
- A source comment never cites a skill or a path under `.claude/`; it names the guard or a file under `docs/`.
  [guard: script:guard:source]

### Errors and imports

- An empty catch, or `.catch(() => {})`, fails the gate: log, rethrow, or say in a comment why ignoring is safe.
  [guard: gate:empty-catch]
- `throw new Error(` on an HTTP path fails the gate; the full error rules are in [`errors.md`](errors.md).
  [guard: gate:http-plain-error]
- Validate once at the boundary (the DTO), then trust the types. Do not re-check what cannot fail.
  [review-only: needs reading]
- The layer rule is `kernel ← db ← platform ← apps` and `kernel ← web-core ← web`; a package never imports app code.
  [guard: foundation-boundaries.spec.ts]
- A backend domain imports another domain only along an arrow in
  `apps/backend/src/architecture/domain-boundaries.allowed.json`. Prefer a domain event to a sideways import.
  [guard: domain-boundaries.spec.ts]
- `forwardRef` means a cycle. Look for the third concept that should own the shared state first; accept it only when
  the cycle cannot be broken. [review-only: needs judgement]

### React and the web

- One component, one purpose: a component that renders a list, manages its filters and submits a form is three
  components under a lean parent. Extend by composition (children, slots, callbacks), not by an internal
  `if (variant === 'x')`; a variant keeps the base component's contract (`onClick`, `disabled`). Props stay narrow:
  pass the fields a row renders, not the whole entity. Data access goes through a hook, never a `fetch` in a
  component. [review-only: needs judgement]
- One component per file, the file named for its export in `kebab-case.tsx` (hooks `use-<thing>.ts`); subcomponents
  only one parent uses sit beside it in its folder, not in its file. Props interfaces are `<Component>Props`;
  handlers are `handleX` inside and `onX` on props; booleans read `isLoading`, `hasError`, `canEdit`.
  [review-only: names need reading]
- A component is at most about 150 lines and its JSX about 40 per render function; a hook at most 50 lines and one
  cohesive surface (data, status and actions for one resource). A god-hook doing three things is three hooks.
  [review-only: the target is a prompt to look; the gate's ceiling is gate:file-size]
- Derive, do not sync: a value computable from props or state is computed (`useMemo` when it is expensive), never
  copied in by a `useEffect`. An effect is the last resort after an event handler, a derived value and a memo.
  [review-only: needs reading]
- `useMemo` and `useCallback` are for three cases: a derived value in an effect's dependency array, a value handed to
  a memoized child, or a computation that is really expensive (sorting or mapping thousands of items). Not for a
  trivial scalar. [review-only: needs judgement]
- A non-reactive value (a file input, a debouncer, a "did this fire" flag, an observer) lives in `useRef`, never in
  `useState`. State is never mutated in place: `setItems([...items, x])`. [review-only: needs reading]
- A dynamic list's `key` is a stable id, never the array index. [review-only: lint does not flag index keys]
- Tailwind classes in JSX, no per-component CSS files, and an inline `style` only for a single dynamic value.
  [review-only: needs reading]
- Every interactive element is reachable by keyboard with a visible focus style. [review-only: no accessibility spec
  runs]

## Recipe: split a file the size rule flags

1. Find the seams: groups of methods that share state and callers, and nothing else. A query side and a command side,
   or one sub-service per lifecycle (`*StatusService`), are the common splits.
2. Move one group into a new `kebab-case.role.ts` beside the old file, inject it where it is used, and keep the public
   surface the callers see unchanged.
3. Run `node tools/guards/convention-gate.mjs`. If a baselined hit only moved to the new file, rewrite the baseline with
   `node tools/guards/convention-gate.mjs --update-baseline --allow-moved`; it refuses if any rule's total across the
   tree rose. Say in the pull request that hits moved.
4. Never edit `tools/guards/convention-gate.baseline.json` by hand, and never merge it by hand on a conflict: rerun
   `--update-baseline`.

## Flag in review

- A method well past 60 lines, or a file past 500, with a clear seam: split it.
- `Manager`, `Helper`, `Util` with no sharper noun: rename.
- `any` with no reason: type it.
- A third copy of the same block: extract it.
- A nested ternary: an `if` or a `switch`.
- A comment that repeats the code, commented-out code, a TODO with no owner: delete.
- `new SomeService()` in business code: inject it.
- A `useEffect` that sets state derivable from props or state: derive it.
- `key={index}` on a list that changes: use the row's id.
- An icon-only button with no `aria-label`, or `data`, `info`, `obj` as a component's state name.
- State mutated before it is set (`arr.push(x); setArr(arr)`); an inline `style` with more than one dynamic value.
- A generic, flag or option with no caller today: remove it.
