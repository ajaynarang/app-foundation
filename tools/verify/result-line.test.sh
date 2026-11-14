#!/usr/bin/env bash
# Hermetic test of result-line.sh, the last line `pnpm verify` prints: pass or fail, the short commit sha, and
# `+dirty` when the tree has uncommitted changes. A throwaway git repository, no network. Run by `pnpm check:ops`.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/result-line.sh"
# No global or system git config: no hooks, signing or templates of the machine running it.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
# Run from a git hook, git exports GIT_DIR and friends pointing at the real repository. Clear them so only the
# throwaway repository is read and written.
# shellcheck disable=SC2046
unset $(git rev-parse --local-env-vars)
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
fails=0

expect() { # <name> <want> <got>
  if [ "$3" = "$2" ]; then echo "ok   $1"; else
    echo "FAIL $1"
    echo "     want: $2"
    echo "     got:  $3"
    fails=$((fails + 1))
  fi
}

# No repository at all: the line still prints, with no sha.
mkdir -p "$work/nogit"
expect "state outside a git repository" 'no-git clean' \
  "$(cd "$work/nogit" && GIT_CEILING_DIRECTORIES="$work" bash "$SCRIPT" --state)"
expect "pass outside a git repository" 'verify: PASS no-git (3s)' \
  "$(cd "$work/nogit" && GIT_CEILING_DIRECTORIES="$work" bash "$SCRIPT" verify 0 "" 3 "")"

git init -q "$work/repo"
cd "$work/repo"
# Refuse to go on unless git now resolves to the throwaway repository.
case "$(git rev-parse --absolute-git-dir)" in "$work"/*) ;; *)
  echo "FAIL git resolves outside the scratch dir" >&2
  exit 1
  ;;
esac
git config user.email test@example.com
git config user.name test
git config commit.gpgsign false

# A repository with no commit yet.
expect "a repository with no commit" 'verify: PASS no-commit (1s)' "$(bash "$SCRIPT" verify 0 "" 1 "")"
expect "state with no commit" 'no-commit clean' "$(bash "$SCRIPT" --state)"

echo a >a.txt && git add -A && git commit -qm base
sha=$(git rev-parse --short=7 HEAD)

expect "state on a clean tree" "${sha} clean" "$(bash "$SCRIPT" --state)"
expect "pass on a clean tree" "verify: PASS ${sha} (12s)" "$(bash "$SCRIPT" verify 0 "" 12 "$sha")"
expect "fail names the step" "verify: FAIL at \"lint\" ${sha} (4s)" "$(bash "$SCRIPT" verify 1 lint 4 "$sha")"

echo b >>a.txt
expect "state on a dirty tree" "${sha} dirty" "$(bash "$SCRIPT" --state)"
expect "a modified tracked file is dirty" "verify: PASS ${sha}+dirty (5s)" "$(bash "$SCRIPT" verify 0 "" 5 "$sha")"
git checkout -q a.txt

echo new >untracked.txt
expect "an untracked file is dirty" "verify: PASS ${sha}+dirty (5s)" "$(bash "$SCRIPT" verify 0 "" 5 "$sha")"
rm untracked.txt

echo ignored.txt >.git/info/exclude
echo x >ignored.txt
expect "an ignored file is not dirty" "verify: PASS ${sha} (5s)" "$(bash "$SCRIPT" verify 0 "" 5 "$sha")"

# HEAD moved while the run was going: the line names the commit it started on, marked dirty.
echo c >c.txt && git add -A && git commit -qm next
expect "a commit made during the run is dirty" "verify: PASS ${sha}+dirty (6s)" "$(bash "$SCRIPT" verify 0 "" 6 "$sha")"

# The started-dirty flag carries through even when the tree is clean at the end.
expect "dirty at the start stays dirty" "verify: FAIL at \"build\" ${sha}+dirty (7s)" \
  "$(bash "$SCRIPT" verify 2 build 7 "$sha" dirty)"

[ "$fails" -eq 0 ] || exit 1
