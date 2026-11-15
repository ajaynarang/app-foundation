#!/usr/bin/env bash
# Regression test: a hermetic shell test run from a git hook must not touch the repository the hook belongs to.
# In a linked worktree, git exports GIT_DIR to the pre-push hook. push-touches-ops.test.sh once ran
# `git init --bare` and `git config user.*` with it set, which wrote core.bare=true and a test identity into the
# real repository's .git/config and broke the main checkout. This builds a decoy repository with a linked
# worktree, installs a real pre-push hook that runs the test, pushes, and checks the decoy's config is unchanged.
# Two hooks: one runs the test the way check-ops.sh does (hook variables cleared), one runs it bare (the test
# must clear them itself). Run by `pnpm check:ops`.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd -P)"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
# This test may itself run from a hook: start from a clean git environment.
# shellcheck disable=SC2046
unset $(git rev-parse --local-env-vars)
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
fails=0

git init -q "$work/decoy"
git -C "$work/decoy" -c user.email=decoy@example.com -c user.name=decoy commit -q --allow-empty -m base
git -C "$work/decoy" worktree add -q "$work/wt" 2>/dev/null
git init -q --bare "$work/target.git"
git -C "$work/wt" remote add target "$work/target.git"
before=$(cat "$work/decoy/.git/config")

push_with_hook() { # <name> <hook body line>
  printf '#!/usr/bin/env bash\n%s >/dev/null 2>&1 || true\nexit 0\n' "$2" >"$work/decoy/.git/hooks/pre-push"
  chmod +x "$work/decoy/.git/hooks/pre-push"
  git -C "$work/wt" push -q target "HEAD:refs/heads/$RANDOM$RANDOM" >/dev/null 2>&1 || true
  if [ "$(cat "$work/decoy/.git/config")" = "$before" ]; then echo "ok   $1"; else
    echo "FAIL $1: the hook's repository config changed"
    fails=$((fails + 1))
    printf '%s\n' "$before" >"$work/decoy/.git/config"
  fi
}

push_with_hook "run as check-ops.sh runs it, from a worktree's pre-push hook" \
  "env \$(git rev-parse --local-env-vars | sed 's/^/-u /') bash '$HERE/push-touches-ops.test.sh'"
push_with_hook "run directly from a worktree's pre-push hook" "bash '$HERE/push-touches-ops.test.sh'"

[ "$fails" -eq 0 ] || exit 1
