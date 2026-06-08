#!/usr/bin/env bash
#
# Pull staging database to local development.
#
# What this does:
#   1. Opens an SSM tunnel to staging RDS (via ECS container)
#   2. pg_dump from staging (localhost:5433)
#   3. Drop & recreate local sally DB (localhost:5432)
#   4. pg_restore into local
#   5. Run prisma migrate deploy (applies any local-only migrations)
#   6. Tear down tunnel
#
# Usage:
#   ./db-pull-staging.sh                       # Full pull + migrate into local dev DB
#   ./db-pull-staging.sh --target stg-debug    # Pull into the parallel stg-debug DB (port 5434)
#   ./db-pull-staging.sh --skip-migrate        # Pull only, no local migrations
#   ./db-pull-staging.sh --dump-only           # Just create the dump file, don't restore
#   ./db-pull-staging.sh --restore-only        # Restore latest dump into target
#   ./db-pull-staging.sh --use-dump <path>     # Restore a specific dump file (no tunnel)
#   ./db-pull-staging.sh --list-dumps          # List saved dumps with timestamps
#   ./db-pull-staging.sh --yes                 # Skip confirmation
#
# Targets:
#   dev        — main local DB at localhost:5432 (default; replaces dev data)
#   stg-debug  — parallel stg-debug DB at localhost:5434
#                Requires: docker compose -f docker-compose.stg-debug.yml up -d
#
# Prerequisites:
#   - AWS CLI configured with SSM access
#   - Target DB container running
#   - apps/backend/.env.aws.staging with DATABASE_URL
#   - pg_dump and pg_restore installed (brew install libpq)

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLUSTER="sally-staging-ecs-cluster"
RDS_HOST="sally-staging-rds-postgres.cb4sy4ym62k1.us-east-1.rds.amazonaws.com"
RDS_PORT="5432"
TUNNEL_PORT="5433"
PREFERRED_CONTAINER="worker"
BACKEND_DIR="$(cd "$TOOLS_DIR/../apps/backend" && pwd)"
DUMP_DIR="$TOOLS_DIR/.dumps"
DUMP_FILE="$DUMP_DIR/staging-$(date +%Y%m%d-%H%M%S).dump"

# Target DB config — defaults to dev, overridable via --target
TARGET="dev"
LOCAL_HOST="localhost"
LOCAL_PORT="5432"
LOCAL_DB="sally"
LOCAL_USER="sally_user"
LOCAL_PASS="sally_password"
TARGET_CONTAINER="sally-postgres"  # for restart messaging only

apply_target() {
  case "$TARGET" in
    dev)
      LOCAL_PORT="5432"
      TARGET_CONTAINER="sally-postgres"
      ;;
    stg-debug)
      LOCAL_PORT="5434"
      TARGET_CONTAINER="sally-postgres-stg-debug"
      ;;
    *)
      echo "ERROR: Unknown --target '$TARGET'. Valid: dev, stg-debug"
      exit 1
      ;;
  esac
}

# --- State ---
TUNNEL_PID=""
TUNNEL_STARTED_BY_US=false

# --- Parse staging credentials from .env.aws.staging ---
STAGING_ENV_FILE="$BACKEND_DIR/.env.aws.staging"

parse_staging_creds() {
  if [[ ! -f "$STAGING_ENV_FILE" ]]; then
    echo "ERROR: Staging credentials file not found: $STAGING_ENV_FILE"
    echo "Create it from .env.aws.staging.example or ask a team member."
    exit 1
  fi
  local db_url
  db_url=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" | head -1 | cut -d= -f2-)
  if [[ -z "$db_url" ]]; then
    echo "ERROR: DATABASE_URL not found in $STAGING_ENV_FILE"
    exit 1
  fi
  # Parse: postgresql://user:pass@host:port/dbname?params
  STAGING_USER=$(echo "$db_url" | python3 -c "from urllib.parse import urlparse; import sys; print(urlparse(sys.stdin.read().strip()).username)")
  STAGING_PASS=$(echo "$db_url" | python3 -c "from urllib.parse import urlparse; import sys; print(urlparse(sys.stdin.read().strip()).password)")
  STAGING_DB=$(echo "$db_url" | python3 -c "from urllib.parse import urlparse; import sys; print(urlparse(sys.stdin.read().strip()).path.lstrip('/'))")
}

# --- Parse arguments ---
MODE="full"  # full | dump-only | restore-only | list-dumps
SKIP_MIGRATE=false
SKIP_CONFIRM=false
USE_DUMP=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-migrate)  SKIP_MIGRATE=true; shift ;;
    --dump-only)     MODE="dump-only"; shift ;;
    --restore-only)  MODE="restore-only"; shift ;;
    --list-dumps)    MODE="list-dumps"; shift ;;
    --use-dump)      MODE="restore-only"; USE_DUMP="$2"; shift 2 ;;
    --target)        TARGET="$2"; shift 2 ;;
    --yes|-y)        SKIP_CONFIRM=true; shift ;;
    --container)     PREFERRED_CONTAINER="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Pull staging database to a local target DB."
      echo ""
      echo "Options:"
      echo "  --target NAME     Target DB: 'dev' (5432, default) or 'stg-debug' (5434)"
      echo "  --skip-migrate    Skip running local migrations after restore"
      echo "  --dump-only       Only create dump file, don't restore"
      echo "  --restore-only    Restore latest dump (no tunnel/dump)"
      echo "  --use-dump PATH   Restore a specific dump file (no tunnel/dump)"
      echo "  --list-dumps      List saved dumps with timestamps and sizes"
      echo "  --container NAME  ECS container for tunnel jump host (default: worker)"
      echo "  --yes, -y         Skip confirmation prompt"
      echo "  -h, --help        Show this help"
      echo ""
      echo "Dump files are saved to: $DUMP_DIR/"
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (use --help for usage)"
      exit 1
      ;;
  esac
done

apply_target

# --- Helpers ---
header() {
  echo ""
  echo "=========================================="
  echo "  SALLY — Pull Staging → ${TARGET}"
  echo "=========================================="
  echo "  Target DB:    ${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB}"
  echo "  Mode:         ${MODE}"
  echo "  Skip migrate: ${SKIP_MIGRATE}"
  echo "  Dump dir:     ${DUMP_DIR}/"
  echo "=========================================="
  echo ""
}

list_dumps() {
  if [[ ! -d "$DUMP_DIR" ]]; then
    echo "No dumps directory at $DUMP_DIR/"
    return 0
  fi
  local found=false
  echo "Saved dumps (newest first):"
  echo ""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    found=true
    local size mtime
    size=$(du -h "$f" | cut -f1)
    mtime=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d. -f1)
    printf "  %-6s  %s  %s\n" "$size" "$mtime" "$(basename "$f")"
  done < <(ls -1t "$DUMP_DIR"/*.dump 2>/dev/null | grep -v latest.dump || true)

  if [[ "$found" == false ]]; then
    echo "  (none found)"
  fi

  if [[ -L "$DUMP_DIR/latest.dump" ]]; then
    echo ""
    echo "  latest.dump → $(readlink "$DUMP_DIR/latest.dump")"
  fi
  echo ""
  echo "Restore one with: $0 --use-dump $DUMP_DIR/<filename>"
}

cleanup() {
  if [[ "$TUNNEL_STARTED_BY_US" == true && -n "$TUNNEL_PID" ]]; then
    echo ""
    echo "Closing SSM tunnel (PID ${TUNNEL_PID})..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    echo "Tunnel closed."
  fi
}
trap cleanup EXIT INT TERM

port_ready() {
  local host="$1" port="$2"
  if command -v pg_isready &>/dev/null; then
    pg_isready -h "$host" -p "$port" &>/dev/null
  else
    nc -z "$host" "$port" &>/dev/null
  fi
}

check_prerequisites() {
  local missing=()

  if ! command -v pg_dump &>/dev/null; then
    missing+=("pg_dump (brew install libpq && brew link --force libpq)")
  fi
  if ! command -v pg_restore &>/dev/null; then
    missing+=("pg_restore (brew install libpq && brew link --force libpq)")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: Missing required tools:"
    for tool in "${missing[@]}"; do
      echo "  - $tool"
    done
    exit 1
  fi
}

check_aws_session() {
  echo "Checking AWS session..."
  if ! aws sts get-caller-identity &>/dev/null; then
    echo "ERROR: AWS session expired or not configured."
    echo "Run: aws sso login"
    exit 1
  fi
  echo "  AWS session active."
}

check_local_db() {
  echo "Checking target database (${TARGET}) on port ${LOCAL_PORT}..."
  if ! port_ready "$LOCAL_HOST" "$LOCAL_PORT"; then
    echo "ERROR: Target PostgreSQL is not running on port ${LOCAL_PORT}."
    if [[ "$TARGET" == "stg-debug" ]]; then
      echo "Start it with: docker compose -f docker-compose.stg-debug.yml up -d"
    else
      echo "Start it with: docker compose up -d postgres"
    fi
    exit 1
  fi
  echo "  Target database ready."
}

check_tunnel_already_running() {
  if lsof -i ":${TUNNEL_PORT}" &>/dev/null; then
    if port_ready 127.0.0.1 "$TUNNEL_PORT"; then
      echo "  Tunnel already running on port ${TUNNEL_PORT} — reusing it."
      TUNNEL_STARTED_BY_US=false
      return 0
    else
      echo "WARNING: Port ${TUNNEL_PORT} is in use but not responding as PostgreSQL."
      echo "Kill the process on that port or use a different port."
      exit 1
    fi
  fi
  return 1
}

start_tunnel() {
  echo "Starting SSM tunnel..."

  TASK_ARNS=$(aws ecs list-tasks \
    --cluster "$CLUSTER" \
    --desired-status RUNNING \
    --query 'taskArns[*]' \
    --output text 2>&1)

  if [[ -z "$TASK_ARNS" || "$TASK_ARNS" == "None" ]]; then
    echo "ERROR: No running tasks in cluster ${CLUSTER}"
    exit 1
  fi

  TASKS_JSON=$(aws ecs describe-tasks \
    --cluster "$CLUSTER" \
    --tasks $TASK_ARNS \
    --query 'tasks[?lastStatus==`RUNNING`].{taskId:taskArn,containers:containers[*].{name:name,runtimeId:runtimeId}}' \
    --output json)

  TARGET_INFO=$(echo "$TASKS_JSON" | PREFERRED="$PREFERRED_CONTAINER" python3 -c "
import json, sys, os
tasks = json.load(sys.stdin)
preferred = os.environ['PREFERRED']
for task in tasks:
    task_id = task['taskId'].split('/')[-1]
    for container in task['containers']:
        if container['name'] == preferred and container['runtimeId']:
            print(f\"{task_id} {container['runtimeId']} {container['name']}\")
            sys.exit(0)
for task in tasks:
    task_id = task['taskId'].split('/')[-1]
    for container in task['containers']:
        if container['runtimeId']:
            print(f\"{task_id} {container['runtimeId']} {container['name']}\")
            sys.exit(0)
print('ERROR', file=sys.stderr)
sys.exit(1)
")

  TASK_ID=$(echo "$TARGET_INFO" | awk '{print $1}')
  RUNTIME_ID=$(echo "$TARGET_INFO" | awk '{print $2}')
  CONTAINER_NAME=$(echo "$TARGET_INFO" | awk '{print $3}')
  TARGET="ecs:${CLUSTER}_${TASK_ID}_${RUNTIME_ID}"

  echo "  Container: ${CONTAINER_NAME} (task: ${TASK_ID})"

  SSM_LOG="/tmp/ssm-tunnel-$$.log"

  aws ssm start-session \
    --target "$TARGET" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"${RDS_PORT}\"],\"localPortNumber\":[\"${TUNNEL_PORT}\"]}" \
    >"$SSM_LOG" 2>&1 &

  TUNNEL_PID=$!
  TUNNEL_STARTED_BY_US=true

  echo -n "  Waiting for tunnel"
  for i in $(seq 1 30); do
    if port_ready 127.0.0.1 "$TUNNEL_PORT"; then
      sleep 3
      echo " ready!"
      return 0
    fi
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      echo ""
      echo "ERROR: Tunnel process died unexpectedly."
      if [[ -s "$SSM_LOG" ]]; then
        echo "SSM output:"
        cat "$SSM_LOG"
      fi
      TUNNEL_PID=""
      exit 1
    fi
    echo -n "."
    sleep 1
  done

  echo ""
  echo "ERROR: Tunnel failed to become ready within 30 seconds."
  exit 1
}

dump_staging() {
  mkdir -p "$DUMP_DIR"

  echo "--- Dumping staging database ---"
  echo "  Output: $DUMP_FILE"
  echo ""

  PGPASSWORD="$STAGING_PASS" PGSSLMODE=require pg_dump \
    -h 127.0.0.1 \
    -p "$TUNNEL_PORT" \
    -U "$STAGING_USER" \
    -d "$STAGING_DB" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --no-comments \
    --verbose \
    -f "$DUMP_FILE" 2>&1 | grep -E "^pg_dump:" | head -20

  local size
  size=$(du -h "$DUMP_FILE" | cut -f1)
  echo ""
  echo "  Dump complete: ${size}"

  # Symlink latest for --restore-only
  ln -sf "$(basename "$DUMP_FILE")" "$DUMP_DIR/latest.dump"
}

restore_local() {
  local restore_file="$1"

  if [[ ! -f "$restore_file" ]]; then
    echo "ERROR: Dump file not found: $restore_file"
    exit 1
  fi

  echo "--- Restoring to local database ---"
  echo "  Source: $restore_file"
  echo ""

  # Stop containers that hold DB connections
  echo "  Stopping backend/frontend containers..."
  docker stop sally-backend sally-frontend 2>/dev/null || true

  # Terminate any remaining connections
  PGPASSWORD="$LOCAL_PASS" psql \
    -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LOCAL_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true

  # Drop and recreate
  echo "  Dropping local database..."
  PGPASSWORD="$LOCAL_PASS" dropdb \
    -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" \
    --if-exists "$LOCAL_DB"

  echo "  Creating fresh database..."
  PGPASSWORD="$LOCAL_PASS" createdb \
    -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" \
    "$LOCAL_DB"

  # Restore
  echo "  Restoring data..."
  PGPASSWORD="$LOCAL_PASS" pg_restore \
    -h "$LOCAL_HOST" \
    -p "$LOCAL_PORT" \
    -U "$LOCAL_USER" \
    -d "$LOCAL_DB" \
    --no-owner \
    --no-privileges \
    "$restore_file" 2>&1 | grep -v "^$" | tail -5 || true

  echo "  Restore complete."
  echo ""
}

run_local_migrations() {
  echo "--- Applying local migrations ---"
  cd "$BACKEND_DIR"

  local output
  local exit_code=0
  output=$(DATABASE_URL="postgresql://${LOCAL_USER}:${LOCAL_PASS}@${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB}" \
    pnpm exec prisma migrate deploy 2>&1) || exit_code=$?

  echo "$output" | grep -E "Applying migration|successfully applied|already in sync|No pending" || true

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "ERROR: prisma migrate deploy failed (exit code: $exit_code)"
    echo "$output"
    exit 1
  fi

  if echo "$output" | grep -q "already in sync"; then
    echo "  No additional local migrations to apply."
  fi
  echo ""
}

confirm_proceed() {
  if [[ "$SKIP_CONFIRM" == true ]]; then
    return 0
  fi

  echo "  WARNING: This will DROP your local sally database and replace it with staging data."
  echo ""
  echo -n "Proceed? (y/n): "
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
}

# ===== Main =====
if [[ "$MODE" == "list-dumps" ]]; then
  list_dumps
  exit 0
fi

header
check_prerequisites

case "$MODE" in
  full)
    parse_staging_creds
    check_local_db
    check_aws_session
    confirm_proceed

    if ! check_tunnel_already_running; then
      start_tunnel
    fi

    dump_staging
    restore_local "$DUMP_FILE"

    if [[ "$SKIP_MIGRATE" == false ]]; then
      run_local_migrations
    fi

    if [[ "$TARGET" == "dev" ]]; then
      echo "--- Restarting containers ---"
      docker start sally-backend sally-frontend 2>/dev/null && echo "  Backend & frontend started." || echo "  (Containers not available, start manually)"
    fi

    echo ""
    echo "Done! Target '${TARGET}' database now matches staging."
    if [[ "$SKIP_MIGRATE" == false ]]; then
      echo "Local-only migrations have been applied on top."
    fi
    ;;

  dump-only)
    parse_staging_creds
    check_aws_session

    if ! check_tunnel_already_running; then
      start_tunnel
    fi

    dump_staging

    echo ""
    echo "Done! Dump saved to: $DUMP_FILE"
    echo "Restore later with: $0 --restore-only"
    ;;

  restore-only)
    check_local_db

    if [[ -n "$USE_DUMP" ]]; then
      if [[ ! -f "$USE_DUMP" ]]; then
        echo "ERROR: Dump file not found: $USE_DUMP"
        exit 1
      fi
      RESTORE_FILE="$USE_DUMP"
    else
      LATEST="$DUMP_DIR/latest.dump"
      if [[ ! -f "$LATEST" ]]; then
        echo "ERROR: No dump file found. Run '$0 --dump-only' first."
        echo "Or pick one explicitly: '$0 --list-dumps' then '$0 --use-dump <path>'."
        echo "Looking in: $DUMP_DIR/"
        exit 1
      fi
      RESTORE_FILE=$(readlink -f "$LATEST" 2>/dev/null || readlink "$LATEST")
    fi

    echo "  Using dump: $RESTORE_FILE"
    confirm_proceed
    restore_local "$RESTORE_FILE"

    if [[ "$SKIP_MIGRATE" == false ]]; then
      run_local_migrations
    fi

    if [[ "$TARGET" == "dev" ]]; then
      echo "--- Restarting containers ---"
      docker start sally-backend sally-frontend 2>/dev/null && echo "  Backend & frontend started." || echo "  (Containers not available, start manually)"
    fi

    echo ""
    echo "Done! Target '${TARGET}' database restored from dump."
    ;;
esac

echo ""
