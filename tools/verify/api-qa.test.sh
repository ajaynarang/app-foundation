#!/usr/bin/env bash
# Hermetic test of api-qa.sh's first step: with DATABASE_URL or REDIS_URL unset it stops at once, names what is
# missing, and runs nothing (no build, no migration, no seed). Run by `pnpm check:ops`. It never sets both, so the
# script never gets past that check here.
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/api-qa.sh"
fails=0
# Stubs first on PATH: if the check were missing, the script would reach these and nothing real (a build, a
# migration against whatever listens on a default port) would run.
stubs=$(mktemp -d)
trap 'rm -rf "$stubs"' EXIT
for tool in pnpm node curl docker; do
  printf '#!/usr/bin/env bash\necho "STUB-%s-CALLED"\nexit 1\n' "$tool" >"$stubs/$tool"
  chmod +x "$stubs/$tool"
done
export PATH="$stubs:$PATH"

expect_refused() { # <name> <want-in-output> <dont-want-in-output> [VAR=value ...]
  local name=$1 want=$2 dont=$3
  shift 3
  local out code
  out=$(env -u DATABASE_URL -u REDIS_URL "$@" bash "$SCRIPT" 2>&1)
  code=$?
  if [ "$code" -eq 0 ]; then
    echo "FAIL $name (exit 0)"
    fails=$((fails + 1))
  elif ! grep -q -- "$want" <<<"$out"; then
    echo "FAIL $name (no \"$want\" in: $out)"
    fails=$((fails + 1))
  elif [ -n "$dont" ] && grep -q -- "$dont" <<<"$out"; then
    echo "FAIL $name (\"$dont\" in: $out)"
    fails=$((fails + 1))
  elif grep -q -- "STUB-" <<<"$out"; then
    echo "FAIL $name (it went on to run a tool)"
    fails=$((fails + 1))
  else
    echo "ok   $name"
  fi
}

expect_refused "both unset: names both" "DATABASE_URL, REDIS_URL" ""
expect_refused "only REDIS_URL unset: names it alone" "REDIS_URL" "DATABASE_URL," \
  DATABASE_URL=postgresql://u:p@db.invalid:1/app
expect_refused "only DATABASE_URL unset: names it alone" "DATABASE_URL" "REDIS_URL" REDIS_URL=redis://cache.invalid:1
expect_refused "an empty value counts as unset" "DATABASE_URL" "" DATABASE_URL= REDIS_URL=redis://cache.invalid:1

if [ "$fails" -gt 0 ]; then
  echo "api-qa.test: $fails failed"
  exit 1
fi
echo "api-qa.test: all passed"
