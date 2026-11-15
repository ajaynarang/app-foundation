---
name: app-push-foundation
description: Use when a change this product made to foundation-owned files should go back to the template so every product gets it — after a `FOUNDATION TOUCHED` line, when a review lists foundation files, or on "send this to the foundation", "push this upstream", /app-push-foundation. Applies the change on a branch in a worktree of the template, settles what is left, runs the template's gates and opens a pull request there. Always optional; the product's own pull request never waits for it.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill
owner: foundation
guards:
  - script:foundation:push
  - script:foundation:status
  - tools/foundation/push.test.mjs
---

# Push to the foundation

Offer a change made here, in files the template owns, back to the template. The record is `foundation.json` at
the root: `owned` lists those files, `base` is the template version this product is on.

**Input:** $ARGUMENTS — files or folders to send, or nothing for a choice from everything that differs.

Run this in a product. It writes only inside a worktree of the template; nothing here changes.

## Step 1 — Decide what is worth sending

1. `pnpm foundation:status` lists the owned files this product changed, added or deleted.
2. For each one, ask: would another product want this exactly as it is? Send a fix, a missing guard, a general
   capability. Keep here what only this product needs: its vocabulary, its rules, a workaround for its own data.
   A change that mixes both is split first, in this repository, so the general part stands alone.
3. Tell the user the list you propose and why, and let them cut it. Nothing below runs without that answer.

## Step 2 — A branch in the template

The template is a checkout on this machine (ask for its path when it is not beside this repository; its git URL is
`template` in `foundation.json`). Never write into its default branch or its main checkout:

```bash
git -C <template> fetch origin
git -C <template> worktree add .worktrees/from-<product>-<slug> -b from-<product>/<slug> origin/<default-branch>
```

## Step 3 — Send

```bash
pnpm foundation:push --to <template>/.worktrees/from-<product>-<slug> <files or folders> --dry-run
pnpm foundation:push --to <template>/.worktrees/from-<product>-<slug> <files or folders>
```

Each file is merged three ways into the template's current copy, so lines this product never changed keep the
template's own names. It commits nothing. Exit 2 means something is left to settle:

1. **Conflicts.** The template moved the same lines since this product's base. `template` is its text, `product`
   is this repository's. Keep the template's newer work and add this change to it.
2. **Names this product.** A changed line carries the product's name. Reword it for any product.
3. **Not sent.** A file deleted here is never sent. Delete it in the worktree by hand only when the template
   should lose it for every product.

Then read the whole diff in the worktree once as a stranger would: no product name, no product rule, no path that
exists only here. A new file in an area the template does not own yet needs its glob added to `owned` there.

## Step 4 — The template's gates and pull request

Work inside the worktree from here, by the template's own rules (its `CLAUDE.md`, its execute skill): install,
add or extend the test that holds the change, update the docs it makes untrue, run `pnpm verify`, and
`pnpm verify:scaffold` when the change touches what a scaffold renames. Commit, push the branch and open a pull
request in the template's repository that says which product it came from and why every product wants it, with the
`pnpm verify` line. Do not merge: the owner merges.

## Step 5 — Back here

Say in the product's pull request, in one line, that the change was offered and link the template's pull request.
After that one merges and this product pulls the next version, the pull finds both sides equal and the file stops
showing in `pnpm foundation:status`.

## Stop and correct when

- You are writing into the template's default branch or its main checkout.
- A file went out that names this product, its domain or its data.
- The product's own pull request is waiting on the template's.
- You sent a file the user did not agree to send.
