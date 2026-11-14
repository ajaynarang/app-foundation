# ADR-0015 — Workflow: a conventions index, guards before prose, and the product's own domain skill

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

The starter's assistant workflow used to be two pattern skills of over a thousand lines each, loaded whole on every
task, plus workflow skills named `plan` and `review` that collided with built-in commands. The pattern skills mixed
rules a machine could check with prose nobody kept true: their text cited files and symbols that no longer existed,
and source comments cited the skills by names that never existed. Nothing in the repository said which plugin the
skills depended on, and every product built from the starter would have inherited the drift.

## Decision

**The rules live in one conventions index with one reference per area; every rule names the guard that holds it; the
workflow skills and agents carry a per-product prefix and point at the references instead of restating them; and a
product adds its own knowledge only in its own domain skill.**

- **One conventions skill.** `.claude/skills/app-conventions/SKILL.md` holds the rules that apply in every layer
  and a routing table; each area has one reference under its `references/` folder, opened only when the task touches
  that area. Held by the skills guard (`tools/guards/skills-guard.mjs`): an index over 200 lines, a reference over
  450 or a workflow skill or agent over 200 fails; so does a reference its index does not link.
- **Guards before prose.** Each rule in a rules section ends `[guard: <spec, lint rule, gate rule or script>]` or
  `[review-only: <why no machine can check it>]`. The guard named must exist. A rule that a machine can check gets the
  check, not a paragraph. Held by the skills guard.
- **The text stays true.** A skill, agent or doc that cites a path, glob, `path#Symbol` anchor, skill or guard that
  does not exist fails `pnpm guards`, which runs in the pre-commit and pre-push hooks and in `pnpm verify`. Source
  comments cite a guard or a file under `docs/`, never a skill or a path under `.claude/` (`pnpm guard:source`).
- **Every skill and agent carries a prefix and an owner.** Names are `<skillPrefix>-<name>` (`skillPrefix` in
  `.claude/workflow.json`; `app` in the template) and never start with a reserved name. Each file's frontmatter says
  `owner: foundation` or `owner: product`. Foundation files never name a product entity. Held by the skills guard,
  for every skill and agent.
- **The workflow.** Brainstorm, plan, execute, review (`app-brainstorm`, `app-plan`, `app-execute`, `app-review`),
  with `app-epic` driving a whole epic, `app-dev-docs` keeping the docs true, `app-qa`, `app-verify` and
  `app-test-notes` for testing, and `app-standards-audit` for drift. Four agents: `app-explorer`, `app-reviewer` (one
  review dimension per run), `app-qa-runner`, `app-persona`. The playbook is `docs/how-we-build.md`. Review only: a
  skill describes a procedure, and no machine can check that one is followed.
- **Review spends no person on a machine's rule.** `app-review` runs the guards, lint and the architecture specs
  first and compares the pull request's `pnpm verify` line with its head commit; reviewers look only for what the
  references list under "Flag in review". Review only.
- **Optional features prune themselves.** A skill, reference or hotspot file for an optional feature carries
  `requires: <feature>`; `init-app`'s prune step deletes it when the feature's folder is absent, and the skills guard
  fails on a leftover. No feature manifest names a skill path, since the prefix rename would break it
  (`tools/init-app/prune-requires.test.mjs`).
- **The product's own knowledge goes in its domain skill**, not in the foundation skills: vocabulary, personas, the
  review checks of its domain, its test preconditions, and "where this product differs" from a foundation rule, each
  difference with a link to the ADR that records it. Review only until the domain skill ships with its template.
- **The `superpowers` plugin is a declared dependency** of the workflow skills, in `.claude/settings.json`.

## Consequences

- A task loads the index and one or two references, not every rule of every layer.
- Moving or renaming a file a skill cites fails the commit that does it, with the file and line, so the change that
  breaks a citation fixes it.
- A product built from the starter gets the whole workflow under its own prefix and adds only its domain skill on top.
- A rule a reviewer keeps catching is a candidate guard: `app-standards-audit` files each gap with the guard that will
  keep it closed.
- Left out on purpose: a shared plugin that pushes skill updates into scaffolded products (files carry `owner:` so one
  can be built later), a note vault, and a docs site.

### Amendment — 2026-11-14: the domain skill ships, and a test holds the seam

The domain skill now ships with its template: `.claude/skills/app-domain/` (`SKILL.md` and the references
`personas.md`, `review-checks.md`, `test-preconditions.md`), every file `owner: product` and `filled: false` until the
product writes it. A reader treats a `filled: false` file as absent and never invents its content. `app-runway` fills
it, after the binding docs, in a product's first days. The seam is held by `tools/guards/domain-seam.test.mjs` (in
`pnpm test:guards`): it fails when the reviewer's domain dimension, test notes, the QA runner or the persona agent
stops citing its file, when the conventions index stops linking "Where this product differs" or that heading is
renamed, or when the domain files lose `owner: product`. What a product writes inside the skill stays review only.
How a product uses it is `docs/adding-your-domain.md`.
