# ADR-0016 — Planning artifacts: untracked in the template, tracked by default in a product

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

The workflow skills (`app-brainstorm`, `app-plan`, `app-execute`, `app-epic`, `app-test-notes`,
`app-standards-audit`) write designs, plans, test notes and audit ledgers to one folder, `plans.folder` in
`.claude/workflow.json`. A later session, a worktree, or a reviewer reads them back: a plan is what `app-execute`
executes, and an epic resumes from its slice plans.

This starter is a public repository. Its own plans name work in progress and other projects, so they stay out of git:
the root `.gitignore` ignores the folder and `plans.tracked` is `false`. A product built from it is normally private,
and a plan that lives only on one machine is lost to every other session. Before this record, every scaffolded product
inherited the ignore line and started with untracked plans.

## Decision

**The template keeps its plans out of git; a product scaffolded from it tracks them unless it says otherwise.**

- **`pnpm init-app --plans tracked|untracked`, default `tracked`.** With `tracked`, init-app removes the plans folder
  line (and its comment) from `.gitignore`; either way it writes the choice to `plans.tracked` in
  `.claude/workflow.json`. Held by `tools/init-app/scaffold-text.test.mjs` and the `defaults` and `desk-untracked`
  variants of `pnpm verify:scaffold` (`tools/init-app/check-variants.mjs`), which check the `.gitignore` line against
  `plans.tracked`.
- **Tracked:** plans are committed on the slice branch they describe, the epic design rides in the first commit of
  slice 1, and a pull request links its plan. A fresh session or worktree finds everything in git.
- **Untracked:** the skills read and write the folder in the primary checkout (the first line of
  `git worktree list`), so a worktree session finds it. Nothing from the folder is posted or quoted into a tracked
  file: an epic issue carries the design summary and each slice issue its task list and acceptance checks, enough to
  re-plan on another machine. Review only: no machine can tell a quoted plan from original text.
- **The skills read `plans.tracked`; they never assume a mode.** `tools/guards/workflow-config.mjs` refuses a
  `.claude/workflow.json` without it.

## Consequences

- A product's plans have history, review and backup with its code. A product that does not want that, for example
  one whose repository is public, passes `--plans untracked`.
- The skills guard checks a tracked plans folder like any other doc folder (links and cited paths); an untracked one
  is skipped. A product whose old plans cite files that have since moved fixes the citation or marks it as deleted
  (~~`path`~~).
- The template's `verified:` lines name template commits, which a product's history does not have, so init-app
  removes them; `app-dev-docs audit` writes the product's own.

<!--
Amendments go below, newest last. Never rewrite the decision above; add a dated amendment that says what changed
and why. A decision that is replaced gets a new record, and this one's status becomes "Superseded by".
-->
