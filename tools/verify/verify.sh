#!/usr/bin/env bash
# pnpm verify — the gate a branch passes before a pull request is opened.
#
# CI in this repo is manual-only, so this script is what holds the rules: format check, lint, schema lint,
# type-check, every package's unit tests (all but the Playwright suite, which needs a running backend), build.
# It stops at the first step that fails and always ends with one result line. Paste that line into the pull
# request body.
#
# The backend and platform integration specs read DATABASE_URL and REDIS_URL. Start the local stack first
# (`docker compose up -d postgres redis`) or export both to point somewhere else.
set -uo pipefail

cd "$(dirname "$0")/../.."

step=""
started=$(date +%s)

finish() {
  local code=$?
  local elapsed=$(( $(date +%s) - started ))
  echo
  if [ "$code" -eq 0 ]; then
    echo "verify: PASS (${elapsed}s)"
  else
    echo "verify: FAIL at \"${step}\" (${elapsed}s)"
  fi
  exit "$code"
}
trap finish EXIT

run() {
  step="$1"
  shift
  echo
  echo "── verify: ${step} ──"
  "$@" || exit 1
}

run "format check" pnpm format:check
run "lint" pnpm lint
run "schema lint" pnpm lint:schema
run "type-check" pnpm type-check
run "unit tests" pnpm exec turbo run test --filter=!@app/qa
run "build" pnpm build
