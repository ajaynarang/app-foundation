---
sources:
  - .claude/skills/app-domain
  - .claude/skills/app-runway/SKILL.md
  - .claude/hooks/hotspots/product.json
  - tools/guards/domain-seam.test.mjs
---

# Adding your domain

The starter has no business domain. A product adds its own in two places: the code (backend domains, web features,
models) and the knowledge the workflow needs to build that code well (its vocabulary, personas, invariants, review
checks). This page is about the second, the **domain seam**, and how it reaches the generic workflow without a
single foundation skill being edited.

## The rule

The foundation skills (`owner: foundation` in their frontmatter) never name a product entity, persona or rule. A
product's own knowledge goes in one place, its domain skill, [`app-domain`](../.claude/skills/app-domain/SKILL.md),
and its references. `init-app` gives it the product's prefix. The files are `owner: product`: the product writes
them, and a later update of the starter never overwrites them.

A product that wants to break a foundation rule does it there too, under "Where this product differs": one row per
rule, with the ADR that records why. A difference that is not listed is drift, and review flags it (ADR
[Workflow](adr/0015-workflow-conventions-index-guards-domain-skill.md)).

## What is in it

| File                                                                                                | Holds                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`SKILL.md`](../.claude/skills/app-domain/SKILL.md)                                                 | Vocabulary, roles, the invariants to know first, where this product differs, and pointers to the rest |
| [`references/personas.md`](../.claude/skills/app-domain/references/personas.md)                     | The people the product is for: role, login, day, what they measure and fear, their flows              |
| [`references/review-checks.md`](../.claude/skills/app-domain/references/review-checks.md)           | What a reviewer checks in the product's own code that no foundation rule or guard covers              |
| [`references/test-preconditions.md`](../.claude/skills/app-domain/references/test-preconditions.md) | Logins per persona, demo data, settings and flags, timing, what cannot be tested locally              |
| `.claude/hooks/hotspots/product.json`                                                               | The product's own drift hotspots: a file whose change makes another untrue                            |

Each file ships empty, with `filled: false` in its frontmatter and a "How to fill this" line per section. A reader
treats a `filled: false` file as absent: the persona agent stops, the domain reviewer returns nothing and says why,
test notes use the foundation's preconditions alone. Nothing invents a persona or a check.

The skill points at the binding docs (`docs/domain-map.md`, `docs/lifecycles-and-invariants.md` and the rest) and
never copies them, so each fact lives once.

## Where the workflow reads it

Four places, and nothing else needs editing to add a domain:

1. **Review.** The `domain` dimension of the `app-reviewer` agent reads `review-checks.md`.
2. **Testing.** `app-test-notes`, the `app-qa-runner` agent and the `app-persona` agent read `personas.md` and
   `test-preconditions.md`.
3. **Drift.** The drift reminder (`.claude/hooks/drift-reminder.mjs`) reads `product.json` after every edit, beside
   the foundation's hotspots.
4. **Conventions.** The conventions index (`.claude/skills/app-conventions/SKILL.md`) links "Where this product
   differs", so anyone reading a foundation rule finds the product's exceptions.

`tools/guards/domain-seam.test.mjs` (in `pnpm test:guards`) fails when one of the four stops reading its file, when
a section the links rely on is renamed, or when the domain files lose `owner: product`.

## How to fill it

Run `/app-runway` in the product's first days, right after `init-app`. It interviews the owner and writes the
binding docs in order (vision, domain map, lifecycles and invariants, the first ADRs, event vocabulary, module map,
epics), one at a time with the owner's yes on each, then fills the domain skill from them and updates the binding
table in `CLAUDE.md`. It writes docs only; the code starts with epic E1 (`/app-epic`).

After the runway, the pull request that changes the domain keeps the skill true: a new persona, a new invariant
without a guard, a new hotspot. `app-plan` and `app-dev-docs slice` ask for it.

## Growing it

- **A further reference** (pricing rules, a vendor's quirks, a regulation) goes under the domain skill's
  `references/`, with `owner: product`, a `sources:` list naming the code it describes, and a link from its
  `SKILL.md`. The skills guard then checks it like any foundation reference, and the drift reminder names it when that
  code changes.
- **A check a machine can hold** does not stay a review check: write the spec under `apps/backend/src/architecture/`
  or beside the code, and delete the item.
- **The code itself** follows the extension points in `CLAUDE.md` and the end-to-end order in the conventions skill's
  feature checklist (`.claude/skills/app-conventions/references/feature-checklist.md`).
