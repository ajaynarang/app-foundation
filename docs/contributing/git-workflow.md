---
title: Git Workflow
description: Branching strategy and commit conventions for the SALLY project
---

# Git Workflow

## Branches

SALLY uses a two-branch model with feature branches:

| Branch | Purpose | Deploy Target | Rules |
|--------|---------|---------------|-------|
| `develop` | **Primary active branch**. All work merges here. | Staging (via manual workflow run) | Feature branches merge via PR. Staging deploy is **manual** — run the `Deploy All` or `Deploy Frontend` workflow from the Actions tab after merge. |
| `main` | **Production. Sacred.** | Production (via manual workflow run) | Never commit directly. Never force push. Only updated via PR from `develop`. |
| `feature/*` (or `fix/*`, `docs/*`, `skill/*`) | Individual features and fixes | None | Branch from `develop`, merge to `develop` via PR. |

```
main  (production - SACRED)
  ^
  |  PR (develop -> main) for releases
  |
develop  (staging - primary active branch)
  ^   ^   ^
  |   |   |
  feature/add-driver-pay
      feature/fix-invoice-bug
          feature/update-shield-ui
```

### Critical Rules

1. **Always branch from `develop`**, never from `main`.
2. **Never commit directly to `main`**. All production releases go through a PR from `develop` to `main`.
3. **Never force push to `main`**.
4. Feature branches are short-lived. Merge frequently to avoid drift.

## Workflow

### Starting New Work

```bash
# Make sure you have the latest develop
git checkout develop
git pull origin develop

# Create your feature branch
git checkout -b feature/add-driver-pay-export

# Do your work, commit, push
git add <files>
git commit -m "feat: add driver pay CSV export"
git push -u origin feature/add-driver-pay-export
```

### Creating a PR

Open a PR from your feature branch **to `develop`** (not to `main`). See the [Pull Request Guide](pull-requests.md) for details on format and process.

### After Merge

```bash
# Switch back to develop and pull
git checkout develop
git pull origin develop

# Delete the merged feature branch locally
git branch -d feature/add-driver-pay-export
```

### Production Releases

When `develop` is stable and ready for production:

1. Open a PR from `develop` to `main`.
2. Get required approvals from the people listed in `CODEOWNERS` (if defined) and from the release reviewers per team policy.
3. Merge.
4. After merge, run the `Deploy All` workflow from the Actions tab with `environment: production`. Production deployment is **not automatic** — `workflow_dispatch` only, gated by GitHub environment Required Reviewers.

## Commit Conventions

### Format

```
<type>: <description>

[optional body]

[optional footer]
```

The description should be lowercase, imperative mood ("add" not "added", "fix" not "fixed"), and under 72 characters.

### Commit Types

| Type | When to Use | Example |
|------|------------|---------|
| `feat` | New feature or capability | `feat: add driver pay CSV export` |
| `fix` | Bug fix | `fix: correct invoice total calculation` |
| `refactor` | Code change that neither fixes a bug nor adds a feature | `refactor: extract load validation into shared utility` |
| `chore` | Maintenance, dependencies, config | `chore: update TanStack Query to v5.62` |
| `docs` | Documentation only | `docs: add settlement API examples` |
| `test` | Adding or updating tests | `test: add driver pay calculation tests` |
| `style` | Formatting, whitespace (no logic change) | `style: fix linting errors in fleet module` |
| `perf` | Performance improvement | `perf: optimize load list query with pagination` |
| `ci` | CI/CD changes | `ci: add Playwright e2e tests to pipeline` |

### Multi-Line Commits

For complex changes, add a body explaining the "why":

```
feat: add bulk invoice generation

Dispatchers can now select multiple loads and generate invoices
in a single action. Uses BullMQ for background processing to
handle large batches without blocking the UI.

Closes #142
```

### Examples

```bash
# Simple feature
git commit -m "feat: add driver HOS violation alerts"

# Bug fix
git commit -m "fix: prevent duplicate settlement line items on retry"

# Refactor
git commit -m "refactor: migrate invoice types to shared-types package"

# Multi-line with body
git commit -m "feat: add Shield compliance score dashboard

Adds a new dashboard page showing real-time compliance scores
per driver and vehicle. Scores are calculated by the Shield
engine and cached in Redis for 5-minute intervals."
```

## Tips

- **Commit often** with small, focused commits. Each commit should do one thing.
- **Pull from `develop` frequently** to keep your branch up to date and reduce merge conflicts.
- **Write meaningful commit messages** -- they become the PR history and help future debugging.
- **Squash merge to `develop`** -- when merging a PR, use squash merge so the history stays clean.
- **Never rebase `develop` or `main`** -- only rebase your own feature branches.
- **Delete merged branches** -- keep the branch list clean after your PR is merged.
