---
name: app-test-notes
description: Use when a feature or fix has just shipped and the owner needs to check it by hand — writes a short, human testing script (what to click, in what order, what "right" looks like) for a browser or a phone, not an automated suite. Invoke with "write test notes", "how do I test this", or /app-test-notes.
user-invocable: true
owner: foundation
---

# Rough testing notes

Write a short testing script for something just built: what to click, in what order, and what "right" looks like.
It is for a person with the app open in the other window, not for a machine. The automated suite is `app-qa`; this
is the complement.

**Input:** $ARGUMENTS — an issue or PR number, an epic slice, a branch, a feature name, or nothing (then whatever was
just finished in this session).

**Output:** one file, `<plans>/testing/<slug>.md`, where `<plans>` is `plans.folder` in `.claude/workflow.json`. While
`plans.tracked` is `false`, write it in the primary checkout (the first line of `git worktree list`) and paste it into
the PR as a comment instead of committing it: the PR is public, the plans folder is not. Slug: the issue or PR number
and a short kebab name (`142-ticket-reopen`).

## Ground truths

- **Rough is the point.** A checklist, not a QA plan. Over five minutes to read is too long.
- **Write what to do, not what was built.** "Open Support, pick a ticket, Reopen" beats "the ticket service now
  supports reopening".
- **Every step has an observable.** A step with no "you should see …" cannot be tested.
- **Say what is dark first.** A flag that is off, a plan that lacks the feature, a surface that shows only for one
  role or state: say so before step one, or the tester concludes it is broken when it is hidden.
- **Name the environment.** Which app and URL, which login and role, which workspace. If data must exist first, say
  how to make it.
- **Go for what a unit test cannot reach.** A layout at 375 px, the wrong role trying it, the second attempt at the
  same action, a reload mid-flow, a second workspace in another browser profile, dark theme.
- **No invented UI.** Quote only routes, buttons and copy that exist; read the code under `apps/web/src/features/` and
  `apps/web/src/app/`. One wrong label makes the tester distrust the rest.

## Preconditions to check every time

The foundation's list. The product's own (its personas and roles, its settings, its demo data) is in its domain
skill, `.claude/skills/<prefix>-domain/references/test-preconditions.md` once that exists; read it too.

- **Logins.** The seeds create `owner@example.com` (OWNER), `admin-user@example.com` (ADMIN) and `member@example.com`
  (MEMBER) in the demo workspace, and `admin@example.com`, the platform SUPER_ADMIN, all with the dev password from
  the seeds. The super-admin works the `/admin` pages; never send the tester there for an in-workspace flow. Name a
  role the change should not work for, and include that refusal as a step.
- **Tenancy mode.** `TENANCY_MODE` is `multi` (workspaces on subdomains, a workspace picker at login), `single` (one
  implicit workspace, no tenant UI) or `personal` (signup creates a private workspace). Say which the notes assume,
  and whether the change looks different in the others.
- **Feature flags and plans.** A route behind `@RequireFeature` answers 403 when the workspace's plan lacks the
  feature (`PLAN_ENFORCEMENT=enforce`, the default) and the web shows the upgrade prompt. Say which feature, and how
  to switch it on for the test workspace (`pnpm qa:enable-features --tenant <slug>` turns on every entitlement).
- **Background work is not instant.** Events leave through the outbox; timers fire on the `deadline-sweep` job's next
  run; queued work is answered 202 and finishes later. Say how long to wait and what to refresh. Super-admins see
  timers at `/admin/timers`.
- **Outbound sends.** Outside production the outbound gate sends only to the allow-list. An email or text that does
  not arrive may be held back on purpose: say where to look (Held back on `/admin/outbound`) and how to allow the
  tester's own address.
- **AI.** Local dev may have no provider key. Say what the tester should see without one: a typed "not configured"
  answer, not output. A failure here is the right result, not a bug.
- **Which commit is running.** The local backend runs whatever its checkout has. Unmerged or freshly merged work needs
  a pull and a restart; say so (`app-verify` covers the traps).
- **Permanent writes.** A step that writes an audit row or another append-only record cannot be undone in that
  database; warn the tester, and say what a repeat run needs.

## The file

Write `<plans>/testing/<slug>.md` (docs/superpowers/testing in the template) with these parts, and delete any part
that has nothing to say:

1. A title, `# <Feature> — rough testing notes`, then one line each: **Built** (issue, PR, slice) and **Date**;
   **Where** (app, URL, route) and **Login** (account and role).
2. **Before you start** — the flags, plan, seeds, data and AI-key expectation. "Nothing" if nothing.
3. **The 2-minute version** — three to five bullets: the shortest path that proves it works at all.
4. **Walk it properly** — one subsection per surface, numbered steps of the form "do this → see this".
5. **Worth breaking on purpose** — each edge case and what should happen.
6. **Known gaps** — what was deliberately not built, or built dark, so it does not read as a bug.

## Steps

1. **Work out what shipped.** Read the issue, the PR (`gh pr view <n> --json title,body,files`), the commits, and the
   UI code for each surface. Never write from memory of the conversation.
2. **Establish the preconditions** from both lists above.
3. **Cover every surface the change touches.** A backend change often shows in more than one place: a list and its
   detail sheet, the web and the mobile app, an in-app notification and an email. Walk each, or say a surface is
   unaffected.
4. **Write the file**, then tell the owner the path and a one-line summary. Do not paste the whole file into chat.

## Stop and fix when

- A step names a button, route or copy string you have not seen in the code.
- A feature behind a flag, a plan or a role has notes that do not say so.
- An AI step promises output without saying it needs a provider key.
- There are more than about forty steps: split by surface, or cut to what needs a human.
- A step checks what a unit test or the `@app/qa` suite already covers. Human time goes to layout, copy, roles and
  consistency across surfaces.
- The notes walk only the happy path. The off state (flag off, role refused, window lapsed) is usually where the bug
  is.
