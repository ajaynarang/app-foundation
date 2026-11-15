#!/usr/bin/env bash
# Deploy markers for the observability stack (docs/observability.md, "Deploy markers").
#
#   sentry-release <project> <version> <environment>   a Sentry release and a deploy record for it
#   grafana-annotation <text> <tag>...                 a deploy line on the Grafana dashboards
#   irm-alert <uid> <title> <message> <severity>       a page or notification through a Grafana IRM webhook
#
# Every command is a clean no-op when its credentials are unset, and a vendor failure is a warning, never a failed
# job: a marker must not block a deploy. Inputs come from the environment:
#   SENTRY_AUTH_TOKEN, SENTRY_ORG          sentry-release
#   GRAFANA_URL, GRAFANA_SA_TOKEN          grafana-annotation
#   IRM_WEBHOOK_URL, RUN_URL (optional)    irm-alert
# Secrets are passed through the environment or a header, never printed.
#
# The release version is the git SHA the image was built from: the backend image bakes it in as SENTRY_RELEASE
# (apps/backend/Dockerfile, BUILD_SHA), so every backend error links to this release and its deploy.
#
# Tested by observability-markers.test.sh (pnpm check:ops, and the deploy workflow's validate job).
set -uo pipefail

SENTRY_CLI_VERSION="2.58.5"
CURL_OPTS=(--silent --show-error --fail --max-time 20 --retry 2)

skip() {
  echo "observability-markers: $1 — skipping"
  exit 0
}
warn() {
  echo "::warning::observability-markers: $1"
  exit 0
}

sentry_cli() { npx --yes "@sentry/cli@${SENTRY_CLI_VERSION}" "$@"; }

require_jq() { command -v jq >/dev/null 2>&1 || warn "jq is not installed; marker not sent"; }

cmd_sentry_release() {
  local project="${1:-}" version="${2:?version required}" environment="${3:?environment required}"
  [ -n "${SENTRY_AUTH_TOKEN:-}" ] || skip "SENTRY_AUTH_TOKEN not set"
  [ -n "${SENTRY_ORG:-}" ] || skip "SENTRY_ORG not set"
  [ -n "$project" ] || skip "Sentry project slug not set"
  export SENTRY_AUTH_TOKEN SENTRY_ORG
  export SENTRY_PROJECT="$project"

  sentry_cli releases new "$version" || warn "Sentry release $version not created"
  # Needs the Sentry GitHub integration; a release without commits is still useful.
  sentry_cli releases set-commits "$version" --auto --ignore-missing ||
    echo "::warning::observability-markers: Sentry set-commits failed for $version (continuing)"
  sentry_cli releases finalize "$version" || warn "Sentry release $version not finalized"
  sentry_cli releases deploys "$version" new --env "$environment" ||
    warn "Sentry deploy record for $version ($environment) not created"
  echo "Sentry release $version deployed to $environment ($project)"
}

cmd_grafana_annotation() {
  local text="${1:?text required}"
  shift
  [ -n "${GRAFANA_URL:-}" ] || skip "GRAFANA_URL not set"
  [ -n "${GRAFANA_SA_TOKEN:-}" ] || skip "GRAFANA_SA_TOKEN not set"
  require_jq
  local body
  body=$(jq -cn --arg text "$text" --argjson time "$(($(date +%s) * 1000))" \
    '{time: $time, text: $text, tags: $ARGS.positional}' --args "$@")
  curl "${CURL_OPTS[@]}" -X POST "${GRAFANA_URL%/}/api/annotations" \
    -H "Authorization: Bearer ${GRAFANA_SA_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data "$body" >/dev/null || warn "Grafana annotation not posted"
  echo "Grafana annotation posted: $text [$*]"
}

# Grafana IRM "Webhook" integration payload: alert_uid groups repeats of one incident, state=alerting opens it, and
# severity is what IRM routes on.
cmd_irm_alert() {
  local uid="${1:?uid required}" title="${2:?title required}" message="${3:?message required}"
  local severity="${4:?severity required}"
  [ -n "${IRM_WEBHOOK_URL:-}" ] || skip "IRM_WEBHOOK_URL not set"
  require_jq
  local body
  body=$(jq -cn --arg uid "$uid" --arg title "$title" --arg message "$message" \
    --arg severity "$severity" --arg link "${RUN_URL:-}" \
    '{alert_uid: $uid, title: $title, message: $message, severity: $severity,
      state: "alerting", link_to_upstream_details: $link}')
  curl "${CURL_OPTS[@]}" -X POST "$IRM_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    --data "$body" >/dev/null || warn "IRM alert not posted"
  echo "IRM $severity alert posted: $title"
}

main() {
  local command="${1:-}"
  shift || true
  case "$command" in
    sentry-release) cmd_sentry_release "$@" ;;
    grafana-annotation) cmd_grafana_annotation "$@" ;;
    irm-alert) cmd_irm_alert "$@" ;;
    *)
      echo "usage: $0 {sentry-release|grafana-annotation|irm-alert} ..." >&2
      exit 2
      ;;
  esac
}

main "$@"
