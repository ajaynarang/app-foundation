#!/usr/bin/env bash
# Hermetic test of push-touches-ops.sh: a throwaway git repository with a bare "remote", no network. Run by
# `pnpm check:ops`.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/push-touches-ops.sh"
ZERO=0000000000000000000000000000000000000000
# No global or system git config: no hooks, signing or templates of the machine running it.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0

expect() { # <want: yes|no> <name> [stdin]
  local want=$1 name=$2 input=${3-}
  local got=no
  if printf '%s' "$input" | bash "$SCRIPT"; then got=yes; fi
  if [ "$got" = "$want" ]; then echo "ok   $name"; else echo "FAIL $name (wanted $want, got $got)"; fails=$((fails + 1)); fi
}

git init -q --bare "$work/remote.git"
git init -q "$work/repo"
cd "$work/repo"
git config user.email test@example.com
git config user.name test
git config commit.gpgsign false
git remote add origin "$work/remote.git"

mkdir -p apps docs/runbooks infra tools .github/workflows docs/other
echo a >apps/a.ts && git add -A && git commit -qm base
git push -q origin HEAD:refs/heads/main
base=$(git rev-parse HEAD)

echo b >apps/b.ts && git add -A && git commit -qm app-only
app=$(git rev-parse HEAD)
expect no "an app-only change to an existing branch" "refs/heads/main $app refs/heads/main $base
"
expect no "an app-only new branch" "refs/heads/x $app refs/heads/x $ZERO
"
expect no "a change under docs/ outside docs/runbooks/" "$(echo x >docs/other/x.md && git add -A && git commit -qm docs && echo "refs/heads/main $(git rev-parse HEAD) refs/heads/main $base")
"

for path in infra/x.tf docs/runbooks/api.md .github/workflows/x.yml tools/x.sh; do
  git reset -q --hard "$app"
  echo c >"$path" && git add -A && git commit -qm "touch $path"
  head=$(git rev-parse HEAD)
  expect yes "a change to $path" "refs/heads/main $head refs/heads/main $base
"
  expect yes "a new branch carrying $path" "refs/heads/y $head refs/heads/y $ZERO
"
done
expect yes "no hook input: falls back to the commits no remote has" ""
expect no "a deleted ref" "(delete) $ZERO refs/heads/old $base
"

[ "$fails" -eq 0 ] || exit 1
