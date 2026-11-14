#!/usr/bin/env bash
#
# One-command database migration for local, AWS staging or AWS production.
#
# Local:      Runs against the docker-compose Postgres on localhost:5499 (no tunnel).
# Staging:    Opens an SSM tunnel to the staging RDS (localhost:5433), runs, tears down.
# Production: The same against the production stack, on its own tunnel port (5434), and only after the operator types
#             `production`.
#
# Usage:
#   ./migrate.sh --env local                   # Local: migrate + seed + knowledge base + Langfuse
#   ./migrate.sh --env staging                 # Staging: tunnel + migrate + seed + knowledge base + Langfuse
#   ./migrate.sh --env staging --status        # Just show status
#   ./migrate.sh --env local --migrate-only    # Just migrations, no seeds
#   ./migrate.sh --env staging --dry-run       # Show pending, don't apply
#   ./migrate.sh --env staging --yes           # Skip the confirmation (staging and local only)
#   ./migrate.sh --env local --seed-langfuse   # Seed Langfuse prompts only
#   ./migrate.sh --env local --no-langfuse     # Full mode but skip Langfuse
#   ./migrate.sh --env production --dry-run    # Production: show pending only
#
# AWS credentials:
#   DATABASE_URL is read from apps/backend/.env.aws.<staging|production>. Those files are gitignored; never put
#   credentials in this script. The RDS host and port come from that URL (RDS_HOST / RDS_PORT override them), and
#   the host must be one of that environment's instances (<project>-<env>-…), so a file copied from the other
#   environment stops the run. PROJECT is the Terraform `project` variable (default "app").
#
# Production safety:
#   - Every run that writes needs `production` typed, even with --yes. With no terminal (CI) it needs both --yes and
#     CONFIRM_ENV=production. --status and --dry-run only read.
#   - Seeds are the base platform seeds (packages/appshore/db/prisma/seeds/index.ts) with ENV_TYPE=production, so no
#     dev credential is seeded. Never --reset. SUPER_ADMIN_PASSWORD must be set in .env.aws.production.
#   - Langfuse keys come only from .env.aws.production, never from a laptop's .env.local.
#   - An existing tunnel on the port is never reused, in any environment: it could point at another database.
#
# The jump host is a running task of the API service (<project>-<env>-ecs-service-api), never the worker: the
# worker's ECS Exec is off. This script never creates, grants or switches to a database role.

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$(cd "$TOOLS_DIR/../apps/backend" && pwd)"
DB_PKG_DIR="$(cd "$TOOLS_DIR/../packages/appshore/db" && pwd)"
# Seconds to wait after the tunnel's local port opens, while the forwarding path to RDS establishes.
TUNNEL_SETTLE_SECONDS="${TUNNEL_SETTLE_SECONDS:-3}"
# shellcheck source=lib/db-env.sh
source "$SCRIPT_DIR/lib/db-env.sh"

RDS_HOST="${RDS_HOST:-}"
RDS_PORT="${RDS_PORT:-}"
TUNNEL_PORT=""

# Local DB config (the docker-compose defaults, as in apps/backend/.env.example)
LOCAL_DB_PORT="5499"
LOCAL_DB_URL="postgresql://postgres:postgres@localhost:${LOCAL_DB_PORT}/app?schema=public"

# --- State ---
TUNNEL_PID=""
TUNNEL_STARTED_BY_US=false
DB_URL=""
ENV=""
ENV_FILE=""

# --- Parse arguments ---
MODE="full" # full | migrate-only | seed-only | seed-langfuse | status | dry-run
SKIP_CONFIRM=false
SKIP_LANGFUSE=false

usage() {
  echo "Usage: $0 --env <local|staging|production> [OPTIONS]"
  echo ""
  echo "One-command database migration for local, AWS staging or AWS production."
  echo ""
  echo "Required:"
  echo "  --env local        Target local PostgreSQL (localhost:${LOCAL_DB_PORT})"
  echo "  --env staging      Target AWS staging RDS (SSM tunnel on localhost:5433)"
  echo "  --env production   Target AWS production RDS (SSM tunnel on localhost:5434). A run that writes"
  echo "                     needs 'production' typed; with no terminal, --yes AND CONFIRM_ENV=production."
  echo ""
  echo "Options:"
  echo "  --migrate-only    Apply Prisma migrations only (no seeds)"
  echo "  --seed-only       Run DB seeds and the knowledge-base sync only (no migrations)"
  echo "  --seed-langfuse   Seed Langfuse prompts only (no DB changes)"
  echo "  --no-langfuse     Skip Langfuse seeding in full mode"
  echo "  --status          Show migration & seed status (read-only)"
  echo "  --dry-run         Show pending migrations without applying"
  echo "  --yes, -y         Skip the confirmation prompt (production still needs 'production' typed)"
  echo "  -h, --help        Show this help"
  echo ""
  echo "The tunnel's jump host is a running task of the API service. PROJECT=<name> when the Terraform"
  echo "project variable is not 'app'."
  echo ""
  echo "Examples:"
  echo "  $0 --env local                    # Full migrate + seed + knowledge base + Langfuse"
  echo "  $0 --env staging                  # Full on staging (via SSM tunnel)"
  echo "  $0 --env staging --status         # Check staging status"
  echo "  $0 --env staging --dry-run        # See pending staging migrations"
  echo "  $0 --env local --migrate-only     # Only apply local migrations"
  echo "  $0 --env production --status      # Check production status (read-only)"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
      shift 2
      ;;
    --migrate-only)
      MODE="migrate-only"
      shift
      ;;
    --seed-only)
      MODE="seed-only"
      shift
      ;;
    --seed-langfuse)
      MODE="seed-langfuse"
      shift
      ;;
    --no-langfuse)
      SKIP_LANGFUSE=true
      shift
      ;;
    --status)
      MODE="status"
      shift
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --yes | -y)
      SKIP_CONFIRM=true
      shift
      ;;
    --container)
      echo "ERROR: --container is gone. The jump host is always a task of the API service (the worker's ECS Exec is off)."
      exit 1
      ;;
    -h | --help)
      usage
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
  echo "ERROR: --env is required. Use --env local, staging or production."
  echo "Run $0 --help for usage."
  exit 1
fi

case "$ENV" in
  local) ;;
  staging | production)
    db_env_configure "$ENV"
    TUNNEL_PORT="$DB_TUNNEL_PORT"
    ;;
  *)
    echo "ERROR: --env must be 'local', 'staging' or 'production' (got: $ENV)"
    exit 1
    ;;
esac

is_aws_env() { [[ "$ENV" == "staging" || "$ENV" == "production" ]]; }
writes_seeds() { [[ "$MODE" == "full" || "$MODE" == "seed-only" ]]; }

# --- Set DB URL ---
if [[ "$ENV" == "local" ]]; then
  DB_URL="$LOCAL_DB_URL"
else
  # DATABASE_URL lives in .env.aws.<env> (gitignored); credentials never sit in this script.
  ENV_FILE="$BACKEND_DIR/$DB_ENV_FILE_NAME"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: ${ENV} credentials file not found: $ENV_FILE"
    echo "Create it with DATABASE_URL=... (from Doppler's ${ENV} config) or ask a team member."
    exit 1
  fi
  DB_URL=$(db_env_file_value "$ENV_FILE" DATABASE_URL)
  if [[ -z "$DB_URL" ]]; then
    echo "ERROR: DATABASE_URL not found in $ENV_FILE"
    exit 1
  fi
  # The RDS endpoint comes from the URL itself, so a new or replaced instance needs no edit here.
  RDS_HOST="${RDS_HOST:-$(db_url_part "$DB_URL" hostname)}"
  RDS_PORT="${RDS_PORT:-$(db_url_part "$DB_URL" port)}"
  RDS_PORT="${RDS_PORT:-5432}"
  db_check_host "$RDS_HOST" || exit 1
fi

# Production seeding never falls back to a known super-admin password. Checked before anything is touched.
if [[ "$ENV" == "production" ]] && writes_seeds; then
  db_require_seed_password "$ENV_FILE" || exit 1
fi

# --- All prisma and seed commands run from the db package ---
cd "$DB_PKG_DIR"

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
  echo "  the platform — Database Migration"
  echo "=========================================="
  echo "  Environment: ${ENV}"
  echo "  Mode:        ${MODE}"
  if is_aws_env; then
    echo "  Cluster:     ${DB_CLUSTER}"
    echo "  Jump host:   ${DB_API_SERVICE}"
    echo "  RDS:         ${RDS_HOST}"
    echo "  Tunnel:      localhost:${TUNNEL_PORT}"
  else
    echo "  Database:    localhost:${LOCAL_DB_PORT}/app"
  fi
  echo "=========================================="
  if [[ "$ENV" == "production" ]]; then
    echo ""
    echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "  !!   PRODUCTION — real customer data           !!"
    echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  fi
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
  if ! port_ready 127.0.0.1 "$LOCAL_DB_PORT"; then
    echo "ERROR: Local PostgreSQL is not running on port ${LOCAL_DB_PORT}."
    echo "Start it with: docker compose up -d postgres"
    exit 1
  fi
  echo "  Local database ready."
}

start_tunnel() {
  echo "Starting SSM tunnel..."
  local target_info task_id runtime_id container_name target
  target_info=$(db_find_api_task) || exit 1
  read -r task_id runtime_id container_name <<<"$target_info"
  target="ecs:${DB_CLUSTER}_${task_id}_${runtime_id}"

  echo "  Container: ${container_name} (task: ${task_id}, service: ${DB_API_SERVICE})"

  SSM_LOG="$(mktemp -t ssm-tunnel.XXXXXX)"

  aws ssm start-session \
    --target "$target" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"${RDS_PORT}\"],\"localPortNumber\":[\"${TUNNEL_PORT}\"]}" \
    >"$SSM_LOG" 2>&1 &

  TUNNEL_PID=$!
  TUNNEL_STARTED_BY_US=true

  echo -n "  Waiting for tunnel"
  for _ in $(seq 1 30); do
    if port_ready 127.0.0.1 "$TUNNEL_PORT"; then
      # port_ready passes as soon as session-manager-plugin binds locally,
      # but the forwarding path to RDS needs a moment to fully establish
      sleep "$TUNNEL_SETTLE_SECONDS"
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
  DATABASE_URL="$DB_URL" pnpm exec prisma migrate status 2>&1 |
    grep -v "^Loaded\|^Prisma schema\|^Datasource\|^$" || true
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

# The base platform seeds. In production ENV_TYPE=production makes dev-credentials.ts seed no known password, and
# SUPER_ADMIN_PASSWORD (checked above) is the super-admin's. Never --reset.
run_seeds() {
  echo "--- Running Seeds ---"
  local exit_code=0
  local -a seed_env=(env "DATABASE_URL=$DB_URL")
  if [[ "$ENV" == "production" ]]; then
    seed_env+=(ENV_TYPE=production)
  fi
  "${seed_env[@]}" pnpm exec ts-node prisma/seeds/index.ts 2>&1 |
    grep -v "^\[dotenv" || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "ERROR: Seed failed (exit code: $exit_code)"
    exit 1
  fi
  echo ""
}

# Sync the knowledge base from apps/backend/content (incremental: unchanged files are a no-op). It needs REDIS_URL as
# well (the route resolver's cache) and embeds only when COHERE_API_KEY is set; without it the files are stored for
# full-text search. A failure warns and never blocks the migration.
run_seed_knowledge() {
  echo "--- Syncing Knowledge Base ---"
  local exit_code=0
  (cd "$BACKEND_DIR" && DATABASE_URL="$DB_URL" pnpm seed:knowledge) 2>&1 |
    grep -v "^\[dotenv" || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "  WARNING: knowledge-base sync failed (exit code: $exit_code). Run it again with:"
    echo "    cd apps/backend && DATABASE_URL=... pnpm seed:knowledge"
  fi
  echo ""
}

run_seed_status() {
  echo "--- Seed Status ---"
  DATABASE_URL="$DB_URL" pnpm exec ts-node prisma/seeds/index.ts --status 2>&1 |
    grep -v "^\[dotenv" || true
}

run_seed_langfuse() {
  echo "--- Seeding Langfuse Prompts ---"

  # Keys: .env.aws.<env> for an AWS environment, then .env.local (secrets), then .env (base URL). Production reads
  # ONLY .env.aws.production: falling back to a laptop's .env.local would seed production prompts into the wrong
  # Langfuse project.
  local env_local="$BACKEND_DIR/.env.local"
  local env_base="$BACKEND_DIR/.env"

  local secret_key="" public_key="" base_url=""

  if is_aws_env && [[ -f "$ENV_FILE" ]]; then
    secret_key=$(db_env_file_value "$ENV_FILE" LANGFUSE_SECRET_KEY)
    public_key=$(db_env_file_value "$ENV_FILE" LANGFUSE_PUBLIC_KEY)
    base_url=$(db_env_file_value "$ENV_FILE" LANGFUSE_BASE_URL)
  fi

  if [[ "$ENV" == "production" && (-z "$secret_key" || -z "$public_key" || -z "$base_url") ]]; then
    echo "  WARNING: LANGFUSE_SECRET_KEY / LANGFUSE_PUBLIC_KEY / LANGFUSE_BASE_URL missing from $ENV_FILE"
    echo "  Skipping Langfuse seed for production (no fallback to local keys)."
    return 0
  fi

  if [[ -z "$secret_key" && -f "$env_local" ]]; then
    secret_key=$(db_env_file_value "$env_local" LANGFUSE_SECRET_KEY)
    public_key=$(db_env_file_value "$env_local" LANGFUSE_PUBLIC_KEY)
    base_url=$(db_env_file_value "$env_local" LANGFUSE_BASE_URL)
  fi

  if [[ -z "$base_url" && -f "$env_base" ]]; then
    base_url=$(db_env_file_value "$env_base" LANGFUSE_BASE_URL)
  fi

  if [[ -z "$secret_key" || -z "$public_key" ]]; then
    echo "  WARNING: LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY not found in $env_local"
    echo "  Skipping Langfuse seed. Add keys to .env.local to enable."
    return 0
  fi

  local exit_code=0
  (cd "$BACKEND_DIR" &&
    LANGFUSE_SECRET_KEY="$secret_key" \
      LANGFUSE_PUBLIC_KEY="$public_key" \
      LANGFUSE_BASE_URL="$base_url" \
      npx tsx scripts/seed-langfuse-prompts.ts) 2>&1 || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    echo ""
    echo "ERROR: Langfuse seed failed (exit code: $exit_code)"
    exit 1
  fi
  echo ""
}

confirm_proceed() {
  if [[ "$ENV" == "production" ]]; then
    echo ""
    echo "  You are about to modify the PRODUCTION database (${RDS_HOST})."
    db_confirm_production "$SKIP_CONFIRM" || exit 1
    return 0
  fi

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
  if is_aws_env; then
    check_aws_session
    db_require_free_port "$TUNNEL_PORT" || exit 1
    start_tunnel
    # Point DB_URL at the local SSM tunnel instead of the private RDS host.
    TUNNEL_DB_URL=$(db_tunnel_url "$DB_URL" "$TUNNEL_PORT" || true)
    if [[ -z "$TUNNEL_DB_URL" || "$TUNNEL_DB_URL" == "$DB_URL" ]]; then
      echo "ERROR: Could not point DATABASE_URL at the tunnel (127.0.0.1:${TUNNEL_PORT})."
      echo "Check the DATABASE_URL in $ENV_FILE: expected postgresql://user:password@host[:port]/db."
      exit 1
    fi
    DB_URL="$TUNNEL_DB_URL"
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
    run_seed_knowledge
    run_seed_status
    echo "Done. Seeds and knowledge base applied to ${ENV}."
    ;;

  seed-langfuse)
    if [[ "$ENV" == "production" ]]; then confirm_proceed; fi
    run_seed_langfuse
    echo "Done. Langfuse prompts seeded."
    ;;

  full)
    run_migrate_status
    confirm_proceed
    run_migrate_deploy
    run_seeds
    run_seed_knowledge
    if [[ "$SKIP_LANGFUSE" != true ]]; then
      run_seed_langfuse
    fi
    echo "--- Final Status ---"
    run_migrate_status
    run_seed_status
    echo "Done. Migrations + seeds + knowledge base + Langfuse applied to ${ENV}."
    ;;
esac

echo ""
