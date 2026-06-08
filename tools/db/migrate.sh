#!/usr/bin/env bash
#
# One-command database migration for local or AWS staging.
#
# Local:   Runs against localhost:5432 directly (no tunnel).
# Staging: Opens an SSM tunnel to the staging RDS, runs migrations, tears down.
#
# Usage:
#   ./db-migrate.sh --env local                # Local: migrate + seed + langfuse
#   ./db-migrate.sh --env staging              # Staging: tunnel + migrate + seed + langfuse
#   ./db-migrate.sh --env staging --status     # Just show status
#   ./db-migrate.sh --env local --migrate-only # Just migrations, no seeds
#   ./db-migrate.sh --env staging --dry-run    # Show pending, don't apply
#   ./db-migrate.sh --env staging --yes        # Skip confirmation
#   ./db-migrate.sh --env local --seed-langfuse # Seed Langfuse prompts only
#   ./db-migrate.sh --env local --no-langfuse  # Full mode but skip Langfuse
#
# Staging credentials:
#   The staging DATABASE_URL is read from apps/backend/.env.aws.staging.
#   That file is gitignored. Never hardcode credentials in this script.

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

# Local DB config (from apps/backend/.env)
LOCAL_DB_URL="postgresql://sally_user:sally_password@localhost:5432/sally"

# --- State ---
TUNNEL_PID=""
TUNNEL_STARTED_BY_US=false
DB_URL=""
ENV=""

# --- Parse arguments ---
MODE="full"       # full | migrate-only | seed-only | seed-langfuse | status | dry-run
SKIP_CONFIRM=false
SKIP_LANGFUSE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --container)
      PREFERRED_CONTAINER="$2"
      shift 2
      ;;
    --migrate-only)   MODE="migrate-only"; shift ;;
    --seed-only)      MODE="seed-only"; shift ;;
    --seed-langfuse)  MODE="seed-langfuse"; shift ;;
    --no-langfuse)    SKIP_LANGFUSE=true; shift ;;
    --status)         MODE="status"; shift ;;
    --dry-run)        MODE="dry-run"; shift ;;
    --yes|-y)        SKIP_CONFIRM=true; shift ;;
    -h|--help)
      echo "Usage: $0 --env <local|staging> [OPTIONS]"
      echo ""
      echo "One-command database migration for local or AWS staging."
      echo ""
      echo "Required:"
      echo "  --env local      Target local PostgreSQL (localhost:5432)"
      echo "  --env staging    Target AWS staging RDS (via SSM tunnel)"
      echo ""
      echo "Options:"
      echo "  --container NAME  ECS container to use as tunnel jump host (default: worker)"
      echo "  --migrate-only    Apply Prisma migrations only (no seeds)"
      echo "  --seed-only       Run DB seeds only (no migrations)"
      echo "  --seed-langfuse   Seed Langfuse prompts only (no DB changes)"
      echo "  --no-langfuse     Skip Langfuse seeding in full mode"
      echo "  --status          Show migration & seed status (read-only)"
      echo "  --dry-run         Show pending migrations without applying"
      echo "  --yes, -y         Skip confirmation prompt"
      echo "  -h, --help        Show this help"
      echo ""
      echo "Examples:"
      echo "  $0 --env local                    # Full migrate + seed + langfuse"
      echo "  $0 --env staging                  # Full on staging (via SSM tunnel)"
      echo "  $0 --env staging --status         # Check staging status"
      echo "  $0 --env staging --dry-run        # See pending staging migrations"
      echo "  $0 --env local --migrate-only     # Only apply local migrations"
      echo "  $0 --env local --seed-langfuse    # Only seed Langfuse prompts"
      echo "  $0 --env local --no-langfuse      # Full mode, skip Langfuse"
      echo "  $0 --env staging --container api  # Use api container for tunnel"
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (use --help for usage)"
      exit 1
      ;;
  esac
done

# --- Validate ---
if [[ -z "$ENV" ]]; then
  echo "ERROR: --env is required. Use --env local or --env staging."
  echo "Run $0 --help for usage."
  exit 1
fi

if [[ "$ENV" != "local" && "$ENV" != "staging" ]]; then
  echo "ERROR: --env must be 'local' or 'staging' (got: $ENV)"
  exit 1
fi

# --- Set DB URL ---
if [[ "$ENV" == "local" ]]; then
  DB_URL="$LOCAL_DB_URL"
else
  # Read staging DATABASE_URL from .env.aws.staging (credentials stay in that gitignored file)
  STAGING_ENV_FILE="$BACKEND_DIR/.env.aws.staging"
  if [[ ! -f "$STAGING_ENV_FILE" ]]; then
    echo "ERROR: Staging credentials file not found: $STAGING_ENV_FILE"
    echo "Create it from .env.aws.staging.example or ask a team member."
    exit 1
  fi
  DB_URL=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" | head -1 | cut -d= -f2-)
  if [[ -z "$DB_URL" ]]; then
    echo "ERROR: DATABASE_URL not found in $STAGING_ENV_FILE"
    exit 1
  fi
fi

# --- cd into backend once (all commands run from here) ---
cd "$BACKEND_DIR"

# --- Cleanup handler ---
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

# --- Helpers ---
port_ready() {
  local host="$1" port="$2"
  if command -v pg_isready &>/dev/null; then
    pg_isready -h "$host" -p "$port" &>/dev/null
  else
    nc -z "$host" "$port" &>/dev/null
  fi
}

header() {
  echo ""
  echo "=========================================="
  echo "  SALLY — Database Migration"
  echo "=========================================="
  echo "  Environment: ${ENV}"
  echo "  Mode:        ${MODE}"
  if [[ "$ENV" == "staging" ]]; then
    echo "  RDS:         ${RDS_HOST}"
    echo "  Tunnel:      localhost:${TUNNEL_PORT}"
  else
    echo "  Database:    localhost:5432/sally"
  fi
  echo "=========================================="
  echo ""
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
  echo "Checking local database..."
  if ! port_ready 127.0.0.1 5432; then
    echo "ERROR: Local PostgreSQL is not running on port 5432."
    echo "Start it with: docker compose up -d postgres"
    exit 1
  fi
  echo "  Local database ready."
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

  # Pass preferred container as env var to avoid shell injection into Python
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
      # port_ready passes as soon as session-manager-plugin binds locally,
      # but the forwarding path to RDS needs a moment to fully establish
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
  if [[ -s "$SSM_LOG" ]]; then
    echo "SSM output:"
    cat "$SSM_LOG"
  fi
  exit 1
}

run_migrate_status() {
  echo "--- Migration Status ---"
  DATABASE_URL="$DB_URL" pnpm exec prisma migrate status 2>&1 \
    | grep -v "^Loaded\|^Prisma schema\|^Datasource\|^$" || true
  echo ""
}

run_migrate_deploy() {
  echo "--- Applying Migrations ---"
  local exit_code=0
  OUTPUT=$(DATABASE_URL="$DB_URL" pnpm exec prisma migrate deploy 2>&1) || exit_code=$?

  echo "$OUTPUT" | grep -E "Applying migration|successfully applied|already in sync|No pending" || true

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "ERROR: prisma migrate deploy failed (exit code: $exit_code)"
    echo "$OUTPUT"
    exit 1
  fi

  if echo "$OUTPUT" | grep -q "already in sync"; then
    echo "  No pending migrations."
  fi
  echo ""
}

run_seeds() {
  echo "--- Running Seeds ---"
  local exit_code=0
  DATABASE_URL="$DB_URL" pnpm exec ts-node prisma/seeds/index.ts 2>&1 \
    | grep -v "^\[dotenv" || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "ERROR: Seed failed (exit code: $exit_code)"
    exit 1
  fi
  echo ""
}

run_seed_status() {
  echo "--- Seed Status ---"
  DATABASE_URL="$DB_URL" pnpm exec ts-node prisma/seeds/index.ts --status 2>&1 \
    | grep -v "^\[dotenv" || true
}


run_seed_langfuse() {
  echo "--- Seeding Langfuse Prompts ---"

  # Load Langfuse keys from env files
  # Priority: .env.aws.staging (staging) → .env.local (secrets) → .env (base URL)
  local env_local="$BACKEND_DIR/.env.local"
  local env_base="$BACKEND_DIR/.env"
  local env_staging="$BACKEND_DIR/.env.aws.staging"

  local secret_key="" public_key="" base_url=""

  # For staging, try .env.aws.staging first
  if [[ "$ENV" == "staging" && -f "$env_staging" ]]; then
    secret_key=$(grep -E '^LANGFUSE_SECRET_KEY=' "$env_staging" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    public_key=$(grep -E '^LANGFUSE_PUBLIC_KEY=' "$env_staging" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    base_url=$(grep -E '^LANGFUSE_BASE_URL=' "$env_staging" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
  fi

  # Fall back to .env.local
  if [[ -z "$secret_key" && -f "$env_local" ]]; then
    secret_key=$(grep -E '^LANGFUSE_SECRET_KEY=' "$env_local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    public_key=$(grep -E '^LANGFUSE_PUBLIC_KEY=' "$env_local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    base_url=$(grep -E '^LANGFUSE_BASE_URL=' "$env_local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
  fi

  # Fall back to .env for base URL
  if [[ -z "$base_url" && -f "$env_base" ]]; then
    base_url=$(grep -E '^LANGFUSE_BASE_URL=' "$env_base" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
  fi

  if [[ -z "$secret_key" || -z "$public_key" ]]; then
    echo "  WARNING: LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY not found in $env_local"
    echo "  Skipping Langfuse seed. Add keys to .env.local to enable."
    return 0
  fi

  local exit_code=0
  LANGFUSE_SECRET_KEY="$secret_key" \
  LANGFUSE_PUBLIC_KEY="$public_key" \
  LANGFUSE_BASE_URL="$base_url" \
    npx tsx scripts/seed-langfuse-prompts.ts 2>&1 || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "ERROR: Langfuse seed failed (exit code: $exit_code)"
    exit 1
  fi
  echo ""
}

confirm_proceed() {
  if [[ "$SKIP_CONFIRM" == true ]]; then
    return 0
  fi

  if [[ "$ENV" == "staging" ]]; then
    echo "  WARNING: You are about to modify the STAGING database."
  fi

  echo -n "Proceed? (y/n): "
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
}

# ===== Main =====
header

# Langfuse-only mode doesn't need DB connectivity
if [[ "$MODE" != "seed-langfuse" ]]; then
  if [[ "$ENV" == "staging" ]]; then
    check_aws_session
    if ! check_tunnel_already_running; then
      start_tunnel
    fi
    # Rewrite DB_URL to go through the local SSM tunnel instead of direct RDS
    DB_URL=$(echo "$DB_URL" | sed "s|@${RDS_HOST}:${RDS_PORT}|@127.0.0.1:${TUNNEL_PORT}|")
  else
    check_local_db
  fi
fi

echo ""

case "$MODE" in
  status)
    run_migrate_status
    run_seed_status
    ;;

  dry-run)
    run_migrate_status
    echo "(Dry run — no changes applied)"
    ;;

  migrate-only)
    run_migrate_status
    confirm_proceed
    run_migrate_deploy
    run_migrate_status
    echo "Done. Migrations applied to ${ENV}."
    ;;

  seed-only)
    run_seed_status
    confirm_proceed
    run_seeds
    run_seed_status
    echo "Done. Seeds applied to ${ENV}."
    ;;

  seed-langfuse)
    run_seed_langfuse
    echo "Done. Langfuse prompts seeded."
    ;;

  full)
    run_migrate_status
    confirm_proceed
    run_migrate_deploy
    run_seeds
    if [[ "$SKIP_LANGFUSE" != true ]]; then
      run_seed_langfuse
    fi
    echo "--- Final Status ---"
    run_migrate_status
    run_seed_status
    echo "Done. Migrations + seeds + Langfuse applied to ${ENV}."
    ;;
esac

echo ""
