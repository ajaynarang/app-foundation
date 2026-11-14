#!/usr/bin/env bash
# The result line `pnpm verify` ends with, the one a pull request body carries and a reviewer checks against the
# pull request's head commit:
#
#   verify: PASS <sha> (<seconds>s)
#   verify: FAIL at "<step>" <sha> (<seconds>s)
#
# <sha> is the short commit the run started on, with `+dirty` when the tree had uncommitted changes (tracked or
# untracked, not ignored) at the start or at the end, or when HEAD moved during the run. Outside a git repository it
# is `no-git`; before the first commit, `no-commit`. Git is optional.
#
#   result-line.sh --state                                   prints "<sha> clean|dirty" for the tree now
#   result-line.sh <label> <exit code> <step> <seconds> <start sha> [dirty]
#
# Its hermetic test is result-line.test.sh (run by `pnpm check:ops`).
set -uo pipefail

state() {
  if ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "no-git clean"
    return
  fi
  local sha dirty=clean
  sha=$(git rev-parse --short=7 HEAD 2>/dev/null) || sha=no-commit
  [ -n "$(git status --porcelain 2>/dev/null)" ] && dirty=dirty
  echo "$sha $dirty"
}

if [ "${1-}" = "--state" ]; then
  state
  exit 0
fi

label=$1 code=$2 step=$3 elapsed=$4 start_sha=$5 start_dirty=${6-}
read -r now_sha now_dirty <<<"$(state)"
[ -n "$start_sha" ] || start_sha=$now_sha

marker=""
if [ "$start_dirty" = dirty ] || [ "$now_dirty" = dirty ] || [ "$now_sha" != "$start_sha" ]; then marker="+dirty"; fi

if [ "$code" -eq 0 ]; then
  echo "${label}: PASS ${start_sha}${marker} (${elapsed}s)"
else
  echo "${label}: FAIL at \"${step}\" ${start_sha}${marker} (${elapsed}s)"
fi
