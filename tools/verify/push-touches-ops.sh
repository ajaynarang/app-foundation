#!/usr/bin/env bash
# push-touches-ops.sh — does a push touch the files `pnpm check:ops` checks? Exit 0 when it does, 1 when it does not.
# Used by .husky/pre-push, which passes on the hook's stdin: one `<local ref> <local sha> <remote ref> <remote sha>`
# line per pushed ref.
#
#   - an existing remote ref: the files that differ between the remote sha and the local sha;
#   - a new remote ref (remote sha all zeros): the files of the pushed commits no remote has yet;
#   - a deleted ref (local sha all zeros): nothing;
#   - no stdin at all (the hook's input already read): the files of the commits on HEAD no remote has yet.
#
# The paths: infra/, docs/runbooks/, .github/, tools/.
set -uo pipefail

OPS_PATHS='^(infra|docs/runbooks|\.github|tools)/'
ZERO='0000000000000000000000000000000000000000'

pushed_files() {
  local any=0 local_ref local_sha remote_ref remote_sha
  [ -t 0 ] && exec </dev/null # run by hand from a terminal: no hook input
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ -n "${local_sha:-}" ] || continue
    any=1
    case "$local_sha" in "$ZERO") continue ;; esac
    case "$remote_sha" in
      "$ZERO") git log --name-only --format= "$local_sha" --not --remotes -- 2>/dev/null ;;
      *) git diff --name-only "$remote_sha" "$local_sha" -- 2>/dev/null || git log --name-only --format= "$local_sha" --not --remotes -- ;;
    esac
  done
  if [ "$any" -eq 0 ]; then
    git log --name-only --format= HEAD --not --remotes -- 2>/dev/null
  fi
}

# Not grep -q: it exits at the first match, and with pipefail the writer's SIGPIPE would read as "no match".
pushed_files | grep -E "$OPS_PATHS" >/dev/null
