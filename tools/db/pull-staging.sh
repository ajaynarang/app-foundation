#!/usr/bin/env bash
#
# Copies the STAGING database into the local staging-debug stack (docker-compose.stg-debug.yml), so a staging problem
# can be reproduced on a laptop without touching the dev database.
#
# What this does:
#   1. Opens an SSM tunnel to the staging RDS through a running task of the API service (never the worker).
#   2. pg_dump through the tunnel into tools/.dumps/ (gitignored), with --no-owner --no-privileges, so no role or
#      grant from staging is needed locally.
#   3. Drops and recreates the stg-debug database (localhost:5495), restores the dump, and runs prisma migrate deploy
#      to apply any migration this checkout has that staging does not yet.
#
# Usage:
#   pnpm stg-debug:up                                  # start the stack first
#   ./tools/db/pull-staging.sh                         # dump staging and restore it into stg-debug
#   ./tools/db/pull-staging.sh --dump-only             # only write the dump
#   ./tools/db/pull-staging.sh --restore-only          # restore the latest dump (no tunnel)
#   ./tools/db/pull-staging.sh --use-dump <file>       # restore a given dump (no tunnel)
#   ./tools/db/pull-staging.sh --list-dumps
#   ./tools/db/pull-staging.sh --skip-migrate --yes
#
# Staging only. Any other --env is refused, and the only restore target is the stg-debug database: the dev database
# and every AWS database are never written. The staging host comes from DATABASE_URL in apps/backend/.env.aws.staging
# (gitignored) or RDS_HOST, and must be a <project>-staging-* host. An existing tunnel on the port is never reused.
#
# A staging database can hold real people's data. The dump stays on this machine, in a gitignored folder; delete it
# when you are done (`rm tools/.dumps/*.dump`).
#
# Prerequisites: AWS CLI with SSM access, pg_dump / pg_restore / psql (brew install libpq), and the stg-debug stack.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$TOOLS_DIR/.." && pwd)"
BACKEND_DIR="$REPO_DIR/apps/backend"
DB_PKG_DIR="$REPO_DIR/packages/appshore/db"
# shellcheck source=lib/db-env.sh
source "$SCRIPT_DIR/lib/db-env.sh"

DUMP_DIR="${PULL_STAGING_DUMP_DIR:-$TOOLS_DIR/.dumps}"
TUNNEL_SETTLE_SECONDS="${TUNNEL_SETTLE_SECONDS:-3}"

# The one restore target: the stg-debug Postgres from docker-compose.stg-debug.yml.
TARGET_URL="postgresql://postgres:postgres@localhost:5495/app?schema=public"
TARGET_HOST="$(db_url_part "$TARGET_URL" hostname)"
TARGET_PORT="$(db_url_part "$TARGET_URL" port)"
TARGET_DB="app"
TARGET_USER="postgres"
TARGET_PASS="postgres"

ENV="staging"
MODE="full" # full | dump-only | restore-only | list-dumps
SKIP_MIGRATE=false
SKIP_CONFIRM=false
USE_DUMP=""
RDS_HOST="${RDS_HOST:-}"
RDS_PORT="${RDS_PORT:-}"

usage() {
  cat <<EOF
Usage: $0 [options]

Copies the staging database into the local stg-debug database (localhost:${TARGET_PORT}).

Options:
  --dump-only       Only write the dump file
  --restore-only    Restore the latest dump (no tunnel)
  --use-dump FILE   Restore FILE (no tunnel)
  --list-dumps      List saved dumps
  --skip-migrate    Do not run prisma migrate deploy after the restore
  --yes, -y         Do not ask before replacing the stg-debug database
  -h, --help        This help

Staging only; --env takes no other value. Dumps go to ${DUMP_DIR}/ (gitignored).
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
      shift 2
      ;;
    --target)
      if [[ "${2:-}" != "stg-debug" ]]; then
        echo "ERROR: the only target is stg-debug. The dev database is never replaced with staging data." >&2
        exit 1
      fi
      shift 2
      ;;
    --dump-only)
      MODE="dump-only"
      shift
      ;;
    --restore-only)
      MODE="restore-only"
      shift
      ;;
    --use-dump)
      MODE="restore-only"
      USE_DUMP="${2:-}"
      shift 2
      ;;
    --list-dumps)
      MODE="list-dumps"
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=true
      shift
      ;;
    --yes | -y)
      SKIP_CONFIRM=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (use --help)" >&2
      exit 1
      ;;
  esac
done

if [[ "$ENV" != "staging" ]]; then
  echo "ERROR: pull-staging copies staging only; --env ${ENV:-<empty>} is refused." >&2
  exit 1
fi
db_env_configure staging || exit 1
ENV_FILE="$BACKEND_DIR/$DB_ENV_FILE_NAME"
TUNNEL_PORT="$DB_TUNNEL_PORT"

# --- State ---
TUNNEL_PID=""
cleanup() {
  if [[ -n "$TUNNEL_PID" ]]; then
    echo ""
    echo "Closing SSM tunnel (PID ${TUNNEL_PID})..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

port_ready() {
  if command -v pg_isready &>/dev/null; then
    pg_isready -h "$1" -p "$2" &>/dev/null
  else
    nc -z "$1" "$2" &>/dev/null
  fi
}

require_tools() {
  local missing=() tool
  for tool in "$@"; do
    command -v "$tool" &>/dev/null || missing+=("$tool")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: missing ${missing[*]} (brew install libpq && brew link --force libpq)." >&2
    exit 1
  fi
}

list_dumps() {
  echo "Saved dumps in ${DUMP_DIR}/ (newest first):"
  local f found=false
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    found=true
    printf "  %-6s  %s\n" "$(du -h "$f" | cut -f1)" "$(basename "$f")"
  done < <(find "$DUMP_DIR" -maxdepth 1 -name 'staging-*.dump' -type f 2>/dev/null | sort -r)
  [[ "$found" == true ]] || echo "  (none)"
}

# Staging credentials: user, password and database from the env file's DATABASE_URL; host from RDS_HOST or that URL.
read_staging_url() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found. Copy DATABASE_URL from the staging Doppler config into it." >&2
    exit 1
  fi
  STAGING_URL=$(db_env_file_value "$ENV_FILE" DATABASE_URL)
  if [[ -z "$STAGING_URL" ]]; then
    echo "ERROR: DATABASE_URL is not set in $ENV_FILE." >&2
    exit 1
  fi
  RDS_HOST="${RDS_HOST:-$(db_url_part "$STAGING_URL" hostname)}"
  RDS_PORT="${RDS_PORT:-$(db_url_part "$STAGING_URL" port)}"
  RDS_PORT="${RDS_PORT:-5432}"
  db_check_host "$RDS_HOST" || exit 1
  STAGING_TUNNEL_URL=$(db_tunnel_url "$STAGING_URL" "$TUNNEL_PORT") || {
    echo "ERROR: DATABASE_URL in $ENV_FILE is not a postgres URL." >&2
    exit 1
  }
  # libpq refuses Prisma's own parameters (?schema=public), so pg_dump gets the URL without its query string.
  STAGING_TUNNEL_URL="${STAGING_TUNNEL_URL%%\?*}"
}

check_target() {
  if ! port_ready "$TARGET_HOST" "$TARGET_PORT"; then
    echo "ERROR: the stg-debug Postgres is not running on ${TARGET_HOST}:${TARGET_PORT}. Start it: pnpm stg-debug:up" >&2
    exit 1
  fi
}

confirm() {
  [[ "$SKIP_CONFIRM" == true ]] && return 0
  echo "  This replaces the stg-debug database (${TARGET_HOST}:${TARGET_PORT}/${TARGET_DB}) with staging data."
  printf "  Proceed? (y/n): "
  local answer
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
}

start_tunnel() {
  aws sts get-caller-identity &>/dev/null || {
    echo "ERROR: AWS session expired or not configured. Run: aws sso login" >&2
    exit 1
  }
  db_require_free_port "$TUNNEL_PORT" || exit 1
  local info task_id runtime_id container_name
  info=$(db_find_api_task) || exit 1
  read -r task_id runtime_id container_name <<<"$info"
  echo "Starting SSM tunnel through ${container_name} (task ${task_id}, service ${DB_API_SERVICE})..."
  local log
  log="$(mktemp -t ssm-tunnel.XXXXXX)"
  aws ssm start-session \
    --target "ecs:${DB_CLUSTER}_${task_id}_${runtime_id}" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"${RDS_PORT}\"],\"localPortNumber\":[\"${TUNNEL_PORT}\"]}" \
    >"$log" 2>&1 &
  TUNNEL_PID=$!
  for _ in $(seq 1 30); do
    if port_ready 127.0.0.1 "$TUNNEL_PORT"; then
      sleep "$TUNNEL_SETTLE_SECONDS"
      echo "  Tunnel ready on localhost:${TUNNEL_PORT}."
      return 0
    fi
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      echo "ERROR: the tunnel process died." >&2
      cat "$log" >&2 || true
      TUNNEL_PID=""
      exit 1
    fi
    sleep 1
  done
  echo "ERROR: the tunnel did not come up within 30 seconds." >&2
  exit 1
}

dump_staging() {
  mkdir -p "$DUMP_DIR"
  DUMP_FILE="$DUMP_DIR/staging-$(date +%Y%m%d-%H%M%S).dump"
  echo "--- Dumping staging into $DUMP_FILE ---"
  # --no-owner --no-privileges: no role or grant from staging comes across, so none has to exist locally.
  PGSSLMODE=require pg_dump "$STAGING_TUNNEL_URL" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --no-comments \
    -f "$DUMP_FILE"
  ln -sf "$(basename "$DUMP_FILE")" "$DUMP_DIR/latest.dump"
  echo "  Dump complete: $(du -h "$DUMP_FILE" | cut -f1)"
}

restore_target() {
  local file="$1"
  [[ -f "$file" ]] || {
    echo "ERROR: dump file not found: $file" >&2
    exit 1
  }
  echo "--- Restoring $(basename "$file") into stg-debug ---"
  export PGPASSWORD="$TARGET_PASS"
  psql -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d postgres -X -q \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  dropdb -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" --if-exists "$TARGET_DB"
  createdb -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" "$TARGET_DB"
  pg_restore -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$TARGET_USER" -d "$TARGET_DB" \
    --no-owner \
    --no-privileges \
    "$file" || echo "  pg_restore reported warnings (extensions or comments it cannot recreate); check the data."
  unset PGPASSWORD
  echo "  Restore complete."
}

migrate_target() {
  [[ "$SKIP_MIGRATE" == true ]] && return 0
  echo "--- prisma migrate deploy on stg-debug ---"
  (cd "$DB_PKG_DIR" && DATABASE_URL="$TARGET_URL" pnpm exec prisma migrate deploy)
}

latest_dump() {
  local latest="$DUMP_DIR/latest.dump"
  if [[ ! -e "$latest" ]]; then
    echo "ERROR: no dump in ${DUMP_DIR}/. Run $0 --dump-only first, or pick one with --use-dump." >&2
    exit 1
  fi
  echo "$DUMP_DIR/$(readlink "$latest")"
}

case "$MODE" in
  list-dumps)
    list_dumps
    ;;
  dump-only)
    require_tools pg_dump aws
    read_staging_url
    start_tunnel
    dump_staging
    echo "Done. Restore it with: $0 --restore-only"
    ;;
  restore-only)
    require_tools pg_restore psql dropdb createdb
    check_target
    if [[ -n "$USE_DUMP" ]]; then file="$USE_DUMP"; else file=$(latest_dump) || exit 1; fi
    confirm
    restore_target "$file"
    migrate_target
    echo "Done. stg-debug holds $(basename "$file"). Run the backend on it: pnpm stg-debug:backend"
    ;;
  full)
    require_tools pg_dump pg_restore psql dropdb createdb aws
    read_staging_url
    check_target
    confirm
    start_tunnel
    dump_staging
    restore_target "$DUMP_FILE"
    migrate_target
    echo "Done. stg-debug now matches staging. Run the backend on it: pnpm stg-debug:backend"
    ;;
esac
