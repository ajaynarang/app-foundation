#!/usr/bin/env bash
# The fast, static half of the container checks (the slow half, check-container-user.sh, builds and runs the image).
#
#   check-dockerfiles.sh [repo-root]   defaults to this repo
#
# 1. apps/backend/Dockerfile has a USER line, and the last one is neither root nor uid 0: the container never runs as
#    root.
# 2. In its final stage every COPY carries --chown, and nothing runs `chown -R` (that writes a second layer holding a
#    copy of every file).
# 3. When the root package.json has pnpm patchedDependencies, every `pnpm install` in apps/backend/Dockerfile and
#    apps/web/Dockerfile follows a COPY of patches/ in the same stage. Without the patch files the frozen install
#    fails.
#
# Tested by check-dockerfiles.test.sh; both run in `pnpm check:ops`.
set -uo pipefail

root="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
backend="$root/apps/backend/Dockerfile"
web="$root/apps/web/Dockerfile"
bad=0

fail() {
  echo "check-dockerfiles: $*"
  bad=1
}

if [ ! -f "$backend" ]; then
  fail "no such file: apps/backend/Dockerfile"
else
  last_user=$(awk '/^[[:space:]]*#/ { next } toupper($1) == "USER" { u = $2 } END { print u }' "$backend")
  if [ -z "$last_user" ]; then
    fail "apps/backend/Dockerfile has no USER line, so the container runs as root"
  else
    case "${last_user%%:*}" in
    root | 0) fail "apps/backend/Dockerfile's last USER is ${last_user}; the container must not run as root" ;;
    esac
  fi

  # The final stage: every line after the last FROM, comments left out.
  final=$(awk '/^[[:space:]]*#/ { next } toupper($1) == "FROM" { buf = ""; next } { buf = buf NR ": " $0 "\n" } END { printf "%s", buf }' "$backend")
  unchowned=$(printf '%s' "$final" | awk -F': ' '{ l = $0; sub(/^[0-9]+: /, "", l) } toupper(l) ~ /^[[:space:]]*(COPY|ADD)[[:space:]]/ && l !~ /--chown=/ { print $1 }')
  [ -z "$unchowned" ] || fail "apps/backend/Dockerfile final stage: COPY without --chown on line(s) $(echo "$unchowned" | tr '\n' ' ')"
  if printf '%s' "$final" | grep -Eq 'chown[[:space:]]+(-[A-Za-z]*R|--recursive)'; then
    fail "apps/backend/Dockerfile final stage runs chown -R; copy with --chown instead"
  fi
fi

if [ -f "$root/package.json" ] && grep -q '"patchedDependencies"' "$root/package.json"; then
  for f in "$backend" "$web"; do
    rel="${f#"$root"/}"
    [ -f "$f" ] || {
      fail "no such file: $rel"
      continue
    }
    # Per stage: remember whether patches/ was copied; report an install line before it.
    out=$(awk '
      /^[[:space:]]*#/ { next }
      toupper($1) == "FROM" { copied = 0; next }
      toupper($1) == "COPY" && $0 ~ /(^|[[:space:]])\.?\/?patches\/?([[:space:]]|$)/ { copied = 1 }
      /pnpm[[:space:]]+install/ && !copied { print NR }
    ' "$f")
    [ -z "$out" ] || fail "$rel: pnpm install on line(s) $(echo "$out" | tr '\n' ' ')with no COPY of patches/ before it in its stage (package.json has patchedDependencies)"
  done
fi

if [ "$bad" -eq 0 ]; then echo "check-dockerfiles: ok"; fi
exit "$bad"
