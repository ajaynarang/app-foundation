#!/usr/bin/env bash
# pnpm check:ops — the local gate for the operations files that are not Jest specs: the Grafana-as-code catalog,
# the hermetic shell tests beside the ops scripts, and Terraform.
#
# CI is manual-only, so this runs where it always runs: inside `pnpm verify`, and from the pre-push hook when a push
# touches infra/, docs/runbooks/, .github/ or tools/. The manual workflow .github/workflows/grafana-as-code.yml runs
# this same script, so a CI run and a local run cannot disagree.
#
# In order:
#   1. generate.mjs --check   the generated alerting/ and dashboards/ files match catalog/
#   2. validate.mjs           rules, runbooks, label hygiene, names checked against the code
#   3. the catalog specs      node --test infra/observability/grafana-cloud/
#   4. hermetic shell tests   every *.test.sh under .github/scripts/ and tools/
#   5. Terraform              fmt -check, init -backend=false, validate, test (the AWS provider is mocked, so no
#                             credentials and no cloud calls); one skip line when the terraform binary is absent.
#                             The first init downloads the providers, so it needs the network once.
#
# Plain Node and bash; no database, no Redis, no vendor key. Stops at the first failing step and ends with one line.
set -uo pipefail

cd "$(dirname "$0")/../.."

CATALOG=infra/observability/grafana-cloud
step=""
started=$(date +%s)

finish() {
  local code=$?
  local elapsed=$(($(date +%s) - started))
  echo
  if [ "$code" -eq 0 ]; then
    echo "check:ops: PASS (${elapsed}s)"
  else
    echo "check:ops: FAIL at \"${step}\" (${elapsed}s)"
  fi
  exit "$code"
}
trap finish EXIT

run() {
  step="$1"
  shift
  echo
  echo "── check:ops: ${step} ──"
  "$@" || exit 1
}

run "grafana: generated files match the catalog" node "${CATALOG}/scripts/generate.mjs" --check
run "grafana: validate" node "${CATALOG}/scripts/validate.mjs"
run "grafana: catalog specs" node --test "${CATALOG}/"

shell_tests=$(find .github/scripts tools -name '*.test.sh' -type f 2>/dev/null | sort)
if [ -z "$shell_tests" ]; then
  echo
  echo "── check:ops: hermetic shell tests ──"
  echo "none yet"
else
  while IFS= read -r t; do run "shell test ${t}" bash "$t"; done <<<"$shell_tests"
fi

if command -v terraform >/dev/null 2>&1; then
  run "terraform fmt" terraform -chdir=infra/terraform fmt -check -recursive
  run "terraform init" terraform -chdir=infra/terraform init -backend=false -input=false -lockfile=readonly -no-color
  run "terraform validate" terraform -chdir=infra/terraform validate -no-color
  run "terraform test" terraform -chdir=infra/terraform test -no-color
else
  echo
  echo "── check:ops: terraform ──"
  echo "skip: no terraform binary on the PATH (fmt, validate and test not run)"
fi
