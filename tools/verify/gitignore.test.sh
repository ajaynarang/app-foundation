#!/usr/bin/env bash
# Hermetic test of the root .gitignore: git worktrees (the two worktree folders) and Claude Code's per-machine
# settings stay out of the repository, while Claude Code's tracked files and `.env.example` stay in.
# The rules are copied into a throwaway repository, so this repository is only read. Run by `pnpm check:ops`.
set -euo pipefail

GITIGNORE="$(cd "$(dirname "$0")/../.." && pwd)/.gitignore"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
# Run from a git hook, git exports GIT_DIR and friends pointing at the real repository. Clear them.
# shellcheck disable=SC2046
unset $(git rev-parse --local-env-vars)
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
fails=0

git init -q "$work/repo"
cd "$work/repo"
case "$(git rev-parse --absolute-git-dir)" in "$work"/*) ;; *)
  echo "FAIL git resolves outside the scratch dir" >&2
  exit 1
  ;;
esac
cp "$GITIGNORE" .gitignore

expect() { # <ignored|tracked> <path>
  local got=tracked
  # core.excludesFile=/dev/null: not the machine's global ignore file (~/.config/git/ignore is read by default).
  if git -c core.excludesFile=/dev/null check-ignore -q --no-index "$2"; then got=ignored; fi
  if [ "$got" = "$1" ]; then echo "ok   $2 is $1"; else
    echo "FAIL $2 is $got, wanted $1"
    fails=$((fails + 1))
  fi
}

expect ignored .worktrees/feature/package.json
expect ignored .claude/worktrees/agent-1/package.json
expect ignored .claude/settings.local.json
expect tracked .claude/settings.json
expect tracked .claude/skills/x/SKILL.md
expect tracked apps/backend/.env.example
expect ignored apps/backend/.env

[ "$fails" -eq 0 ] || exit 1
