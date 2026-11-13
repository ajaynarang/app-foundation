#!/usr/bin/env bash
# Hermetic tests for observability-markers.sh. curl and npx are stubs on PATH that record their arguments and can be
# told to fail, so nothing leaves the machine and no vendor account is needed. Run by `pnpm check:ops` and by the
# deploy workflow's validate job.
#   bash .github/scripts/observability-markers.test.sh
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/observability-markers.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin"
CALLS="$WORK/calls.log"

cat >"$WORK/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf 'curl %s\n' "$*" >>"$CALLS"
[ "${STUB_FAIL:-}" = curl ] && exit 22
exit 0
STUB
cat >"$WORK/bin/npx" <<'STUB'
#!/usr/bin/env bash
printf 'npx %s\n' "$*" >>"$CALLS"
[ "${STUB_FAIL:-}" = npx ] && exit 1
exit 0
STUB
chmod +x "$WORK/bin/curl" "$WORK/bin/npx"

failures=0
run() { env -i PATH="$WORK/bin:$PATH" CALLS="$CALLS" HOME="${HOME:-/tmp}" "$@" bash "$SCRIPT" "${ARGS[@]}"; }

# check <name> <expected exit status> <expected vendor calls> [regex that the calls or the output must match]
check() {
  local name="$1" expected_status="$2" expected_calls="$3" pattern="${4:-}"
  local status=0 output
  : >"$CALLS"
  output=$(run ${ENVS[@]+"${ENVS[@]}"} 2>&1) || status=$?
  local calls
  calls=$(wc -l <"$CALLS" | tr -d ' ')
  if [ "$status" != "$expected_status" ] || [ "$calls" != "$expected_calls" ] ||
    { [ -n "$pattern" ] && ! grep -qE -- "$pattern" "$CALLS" <(echo "$output"); }; then
    echo "FAIL: $name (status=$status calls=$calls)"
    echo "$output"
    cat "$CALLS"
    failures=$((failures + 1))
  else
    echo "ok: $name"
  fi
  LAST_OUTPUT="$output"
}

# ── sentry-release ──
ENVS=()
ARGS=(sentry-release app-backend abc123 staging)
check "sentry-release skips without SENTRY_AUTH_TOKEN" 0 0 'skipping'

ENVS=(SENTRY_AUTH_TOKEN=t)
check "sentry-release skips without SENTRY_ORG" 0 0 'skipping'

ENVS=(SENTRY_AUTH_TOKEN=t SENTRY_ORG=o)
ARGS=(sentry-release "" abc123 staging)
check "sentry-release skips without a project slug" 0 0 'skipping'

ARGS=(sentry-release app-backend abc123 staging)
check "sentry-release creates, sets commits, finalizes and records the deploy" 0 4 'deploys abc123 new --env staging'

ENVS=(SENTRY_AUTH_TOKEN=t SENTRY_ORG=o STUB_FAIL=npx)
check "a sentry-release failure is a warning, not a failed deploy" 0 1 '::warning::'

ENVS=(SENTRY_AUTH_TOKEN=supersecret-token SENTRY_ORG=o)
check "sentry-release never prints the token" 0 4
if grep -q supersecret-token <<<"$LAST_OUTPUT"; then
  echo "FAIL: the Sentry token appeared in the output"
  failures=$((failures + 1))
fi

# ── grafana-annotation ──
ENVS=()
ARGS=(grafana-annotation "Deploy" deploy env:staging)
check "grafana-annotation skips without GRAFANA_URL" 0 0 'skipping'

ENVS=(GRAFANA_URL=https://g.example)
check "grafana-annotation skips without GRAFANA_SA_TOKEN" 0 0 'skipping'

ENVS=(GRAFANA_URL=https://g.example/ GRAFANA_SA_TOKEN=s)
check "grafana-annotation posts its tags to /api/annotations" 0 1 \
  'https://g.example/api/annotations .*"tags":\["deploy","env:staging"\]'

ENVS=(GRAFANA_URL=https://g.example GRAFANA_SA_TOKEN=s STUB_FAIL=curl)
check "a grafana-annotation failure is a warning" 0 1 '::warning::'

# ── irm-alert ──
ENVS=()
ARGS=(irm-alert test-fire "Test page" "details" sev1)
check "irm-alert skips without IRM_WEBHOOK_URL" 0 0 'skipping'

ENVS=(IRM_WEBHOOK_URL=https://irm.example/hook RUN_URL=https://ci.example/run/1)
check "irm-alert posts an alerting payload with its severity and link" 0 1 \
  '"severity":"sev1".*"state":"alerting".*"link_to_upstream_details":"https://ci.example/run/1"'

ENVS=(IRM_WEBHOOK_URL=https://irm.example/hook STUB_FAIL=curl)
check "an irm-alert failure is a warning" 0 1 '::warning::'

# ── usage ──
ENVS=()
ARGS=(bogus)
check "an unknown command exits 2" 2 0

ARGS=(sentry-debug-files app-mobile /tmp)
check "sentry-debug-files is not a command here (mobile symbols are not in this template)" 2 0

if [ "$failures" -gt 0 ]; then
  echo "$failures observability-markers test(s) failed"
  exit 1
fi
echo "all observability-markers tests passed"
