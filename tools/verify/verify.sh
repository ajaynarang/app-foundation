#!/usr/bin/env bash
# pnpm verify — the gate a branch passes before a pull request is opened.
#
# CI in this repo is manual-only, so this script is what holds the rules: format check, lint, schema lint,
# type-check, every package's unit tests (all but the Playwright suite, which needs a running backend), the ops
# checks (`pnpm check:ops`: the Grafana-as-code catalog, ops shell tests, Terraform), the RBAC gap audit, build.
# It stops at the first step that fails and always ends with one result line (tools/verify/result-line.sh):
#
#   verify: PASS 1a2b3c4 (512s)
#   verify: FAIL at "lint" 1a2b3c4+dirty (40s)
#
# The sha is the commit the run started on; `+dirty` means the tree had uncommitted changes, so the line does not
# vouch for that commit alone. Paste the line into the pull request body; a reviewer checks the sha against the pull
# request's head commit.
#
# The backend and platform integration specs read DATABASE_URL and REDIS_URL. Start the local stack first
# (`docker compose up -d postgres redis`) or export both to point somewhere else.
set -uo pipefail

cd "$(dirname "$0")/../.."

step=""
started=$(date +%s)
read -r start_sha start_dirty <<<"$(bash tools/verify/result-line.sh --state)"

finish() {
  local code=$?
  local elapsed=$(( $(date +%s) - started ))
  echo
  bash tools/verify/result-line.sh verify "$code" "$step" "$elapsed" "$start_sha" "$start_dirty"
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
# Turbo only formats inside workspace packages; this covers the rest (root files, docs, skills, tools, workflows).
run "format check (outside packages)" pnpm format:check:root
run "lint" pnpm lint
run "schema lint" pnpm lint:schema
run "type-check" pnpm type-check
run "unit tests" pnpm exec turbo run test --filter=!@app/qa
# The scaffold tools (init-app, apply-feature, check-variants) live outside every workspace package.
run "init-app tool tests" pnpm test:init-app
# The operations files that are not Jest specs: the Grafana-as-code catalog, ops shell tests, Terraform.
run "ops checks" pnpm check:ops
# Every controller route declares @Roles() or @Public(); the same audit the manual CI run fails on.
run "rbac audit" pnpm audit:rbac
run "build" pnpm build
