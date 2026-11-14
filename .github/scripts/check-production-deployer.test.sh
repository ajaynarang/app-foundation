#!/usr/bin/env bash
# Hermetic test of check-production-deployer.sh. Run by `pnpm check:ops` and the deploy workflow's validate job.
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-production-deployer.sh"
fails=0

expect() { # <want: pass|fail> <name> <env> <actor> <deployers>
  local got=fail
  if DEPLOY_ENV="$3" ACTOR="$4" PRODUCTION_DEPLOYERS="$5" bash "$SCRIPT" >/dev/null 2>&1; then got=pass; fi
  if [ "$got" = "$1" ]; then echo "ok   $2"; else
    echo "FAIL $2 (wanted $1, got $got)"
    fails=$((fails + 1))
  fi
}

expect pass "staging needs no list" staging someone ""
expect fail "production with PRODUCTION_DEPLOYERS unset is locked" production alice ""
expect fail "production with a list of only commas and spaces is locked" production alice " , ,"
expect pass "a listed login may deploy production" production alice "alice"
expect pass "a login in a list with spaces" production bob " alice , bob ,carol"
expect fail "a login not on the list may not" production mallory "alice,bob"
expect fail "the match is exact, not a prefix" production ali "alice"
expect fail "the match is exact, not a substring of the list" production "alice,bob" "alice,bob"
expect fail "an empty actor may not" production "" "alice"
expect fail "an unknown environment fails" prod alice "alice"

out=$(DEPLOY_ENV=production ACTOR=alice PRODUCTION_DEPLOYERS="" bash "$SCRIPT" 2>&1)
if printf '%s' "$out" | grep -q "PRODUCTION_DEPLOYERS repo variable is not set"; then
  echo "ok   the locked message names the variable to set"
else
  echo "FAIL the locked message names the variable to set"
  fails=$((fails + 1))
fi

[ "$fails" -eq 0 ] || exit 1
