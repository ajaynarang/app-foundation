#!/usr/bin/env bash
# Turn maintenance mode on or off for the web app (docs/operations.md, "Maintenance switch").
#
# The switch is one JSON document, s3://<project>-<env>-cdn/status/maintenance.json, served by the CDN
# (infra/terraform/cdn.tf) with a 30-second cache. apps/web/src/middleware.ts reads its `enabled` key and sends
# signed-in routes to /maintenance, which shows `message` and `estimatedEndTime`. The web app needs
# NEXT_PUBLIC_CDN_URL set to read it; without it the app never shows maintenance.
#
# Usage:
#   tools/ops/maintenance-mode.sh on                         # default reason, 1 hour estimate
#   tools/ops/maintenance-mode.sh on "Database migration"    # custom reason
#   tools/ops/maintenance-mode.sh on "Upgrade" 2h            # custom reason and estimate (30m, 1h, 2h, ...)
#   tools/ops/maintenance-mode.sh off
#   tools/ops/maintenance-mode.sh status
#
# Environment:
#   ENV       staging (default) or production. The target and bucket are printed before every write.
#   PROJECT   the Terraform `project` variable (default "app"); the bucket is <project>-<env>-cdn.
#   Production writes need `production` typed, or CONFIRM_ENV=production when there is no terminal.
#
# Every write is read-modify-write: keys this script does not own stay as they are (a product may add its own, such
# as a mobile version gate). Needs the AWS CLI with a session for that account, and jq.
set -euo pipefail

ENV="${ENV:-staging}"
case "$ENV" in
  staging | production) ;;
  *)
    echo "ERROR: ENV must be 'staging' or 'production' (got '${ENV}')." >&2
    exit 1
    ;;
esac
PROJECT="${PROJECT:-app}"
BUCKET="${PROJECT}-${ENV}-cdn"
S3_KEY="status/maintenance.json"
ACTION="${1:-}"

usage() {
  cat <<'EOF' >&2
Usage: maintenance-mode.sh <on|off|status> [reason] [duration]

  on  [reason] [duration]  Turn maintenance on (keeps every other key in the document)
  off                      Turn maintenance off (keeps every other key in the document)
  status                   Show the current document

  reason:   message shown on /maintenance (default: 'Scheduled maintenance')
  duration: 30m, 1h, 2h, 4h ... (default: 1h)

  ENV=production maintenance-mode.sh on    # production: asks you to type 'production'
EOF
  exit 1
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required (every write is read-modify-write)." >&2
    exit 1
  fi
}

# Seconds for 30m / 2h; anything else is refused rather than guessed.
parse_duration() {
  local dur="${1:-1h}"
  if [[ "$dur" =~ ^([0-9]+)m$ ]]; then
    echo $((10#${BASH_REMATCH[1]} * 60))
  elif [[ "$dur" =~ ^([0-9]+)h$ ]]; then
    echo $((10#${BASH_REMATCH[1]} * 3600))
  else
    echo "ERROR: duration must look like 30m or 2h (got '${dur}')." >&2
    return 1
  fi
}

iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

iso_in() { # <seconds from now>
  local end=$(($(date -u +%s) + $1))
  if date -u -r 0 >/dev/null 2>&1; then
    date -u -r "$end" +%Y-%m-%dT%H:%M:%SZ # BSD date (macOS)
  else
    date -u -d "@$end" +%Y-%m-%dT%H:%M:%SZ # GNU date
  fi
}

print_target() {
  echo "==================================================" >&2
  echo "  Environment: ${ENV}" >&2
  echo "  Bucket:      s3://${BUCKET}/${S3_KEY}" >&2
  if [ "$ENV" = "production" ]; then
    echo "  !! PRODUCTION — every customer's web app reads this !!" >&2
  fi
  echo "==================================================" >&2
}

is_interactive() { [ -t 0 ]; }

# Before any write. Staging proceeds; production needs the operator to type the environment, so a stale
# ENV=production in a shell cannot take the product down by accident.
confirm_write_target() {
  print_target
  [ "$ENV" = "production" ] || return 0
  if is_interactive; then
    local answer=""
    printf "Type 'production' to write to the production status document: " >&2
    read -r answer
    if [ "$answer" != "production" ]; then
      echo "Aborted." >&2
      exit 1
    fi
  elif [ "${CONFIRM_ENV:-}" != "production" ]; then
    echo "ERROR: no terminal to confirm on. Set CONFIRM_ENV=production to write to production." >&2
    exit 1
  fi
}

# The current document, or {} when it is absent or not JSON. Falling back to {} is deliberate: raising maintenance
# during an outage must not be blocked by a missing object.
read_current() {
  local content
  if content=$(aws s3 cp "s3://${BUCKET}/${S3_KEY}" - 2>/dev/null); then
    if printf '%s' "$content" | jq -e 'type == "object"' >/dev/null 2>&1; then
      printf '%s\n' "$content"
      return
    fi
    echo "WARNING: the existing ${S3_KEY} is not a JSON object; starting fresh." >&2
  fi
  echo '{}'
}

put_document() {
  printf '%s' "$1" | jq . | aws s3 cp - "s3://${BUCKET}/${S3_KEY}" \
    --content-type "application/json" \
    --cache-control "public, max-age=30"
  invalidate_cdn
}

# The CDN caches /status/* for about 30 seconds; an invalidation makes the change visible in seconds.
invalidate_cdn() {
  local dist
  dist=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Origins.Items[?contains(DomainName, '${BUCKET}')]].Id | [0]" \
    --output text 2>/dev/null || echo "None")
  if [ -z "$dist" ] || [ "$dist" = "None" ]; then
    echo "  (no CloudFront distribution found for ${BUCKET}; relying on the 30s cache)"
    return
  fi
  if aws cloudfront create-invalidation --distribution-id "$dist" --paths "/status/*" >/dev/null 2>&1; then
    echo "  CloudFront invalidated (${dist})"
  else
    echo "  (invalidation failed; relying on the 30s cache)"
  fi
}

enable_maintenance() {
  local reason="${1:-Scheduled maintenance}" duration="${2:-1h}" secs end updated
  secs=$(parse_duration "$duration") || exit 1
  end=$(iso_in "$secs")
  updated=$(read_current | jq \
    --arg reason "$reason" \
    --arg message "${reason} is in progress. We'll be back shortly." \
    --arg end "$end" \
    --arg started "$(iso_now)" \
    '. + {enabled: true, reason: $reason, message: $message, estimatedEndTime: $end, startedAt: $started}')
  put_document "$updated"
  echo ""
  echo "✓ Maintenance mode ON for ${ENV}"
  echo "  Reason:   ${reason}"
  echo "  Duration: ${duration} (until ${end})"
}

disable_maintenance() {
  # `. + {enabled: false}`, never a fresh object: replacing the document would drop keys this script does not own.
  local updated
  updated=$(read_current | jq 'del(.reason, .message, .estimatedEndTime, .startedAt) + {enabled: false}')
  put_document "$updated"
  echo ""
  echo "✓ Maintenance mode OFF for ${ENV}"
}

check_status() {
  echo "Status document for ${ENV} (s3://${BUCKET}/${S3_KEY}):"
  echo ""
  local content
  if content=$(aws s3 cp "s3://${BUCKET}/${S3_KEY}" - 2>/dev/null); then
    printf '%s' "$content" | jq . 2>/dev/null || printf '%s\n' "$content"
  else
    echo "No maintenance.json found: maintenance is OFF."
  fi
}

case "$ACTION" in
  on)
    require_jq
    shift
    # Validate the duration before asking for confirmation, so a typo never costs a production prompt.
    parse_duration "${2:-1h}" >/dev/null || exit 1
    confirm_write_target
    enable_maintenance "$@"
    ;;
  off)
    require_jq
    confirm_write_target
    disable_maintenance
    ;;
  status)
    require_jq
    print_target
    check_status
    ;;
  *) usage ;;
esac
