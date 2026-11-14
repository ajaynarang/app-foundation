#!/usr/bin/env bash
#
# Opens an SSM port-forwarding tunnel to the staging (default) or production RDS PostgreSQL database.
#
# What this does:
#   1. Finds a running task of the environment's API service (<project>-<env>-ecs-service-api) to use as the jump
#      host. Never the worker: its ECS Exec is off.
#   2. Builds the SSM target string from the task ID + container runtime ID
#   3. Starts an SSM port-forwarding session through that task to the private RDS instance
#
# After running, connect to the DB at localhost:5433 (staging) or localhost:5434 (production).
#
# Usage:
#   ./tunnel.sh                      # Staging
#   ./tunnel.sh --env production     # Production: asks you to type 'production'
#   ./tunnel.sh --local-port 5435    # Use a different local port
#
# The RDS host and port come from RDS_HOST / RDS_PORT in the environment, or else from the DATABASE_URL in
# apps/backend/.env.aws.<env> (gitignored). The port falls back to 5432. The host must be one of that environment's
# instances (<project>-<env>-…). An existing tunnel on the local port is never reused. PROJECT is the Terraform
# `project` variable (default "app").

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../../apps/backend" && pwd)"
# shellcheck source=lib/db-env.sh
source "$SCRIPT_DIR/lib/db-env.sh"

ENV="staging"
RDS_HOST="${RDS_HOST:-}"
RDS_PORT="${RDS_PORT:-}"
LOCAL_PORT=""

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="${2:-}"
      shift 2
      ;;
    --local-port)
      LOCAL_PORT="${2:-}"
      shift 2
      ;;
    --container)
      echo "ERROR: --container is gone. The jump host is always a task of the API service (the worker's ECS Exec is off)."
      exit 1
      ;;
    -h | --help)
      echo "Usage: $0 [--env staging|production] [--local-port PORT]"
      echo ""
      echo "Opens an SSM tunnel to the environment's RDS through a running API service task."
      echo "Connect to the DB at localhost:<local-port> (default: 5433 staging, 5434 production)."
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

db_env_configure "$ENV" || exit 1
LOCAL_PORT="${LOCAL_PORT:-$DB_TUNNEL_PORT}"
ENV_FILE="$BACKEND_DIR/$DB_ENV_FILE_NAME"

# --- Resolve the RDS host and port ---
DB_URL=""
if [[ -f "$ENV_FILE" ]]; then
  DB_URL=$(db_env_file_value "$ENV_FILE" DATABASE_URL)
fi
if [[ -n "$DB_URL" ]]; then
  RDS_HOST="${RDS_HOST:-$(db_url_part "$DB_URL" hostname)}"
  RDS_PORT="${RDS_PORT:-$(db_url_part "$DB_URL" port)}"
fi
RDS_PORT="${RDS_PORT:-5432}"
if [[ -z "$RDS_HOST" ]]; then
  echo "ERROR: RDS host unknown. Set RDS_HOST, or put DATABASE_URL in $ENV_FILE."
  exit 1
fi
db_check_host "$RDS_HOST" || exit 1
db_require_free_port "$LOCAL_PORT" || exit 1

if [[ "$ENV" == "production" ]]; then
  echo ""
  echo "  You are about to open a tunnel to the PRODUCTION database (${RDS_HOST})."
  db_confirm_production false || exit 1
fi

# --- Pick the jump host: a running task of the API service ---
echo "Finding a running task of ${DB_API_SERVICE} in ${DB_CLUSTER}..."
TARGET_INFO=$(db_find_api_task) || exit 1
read -r TASK_ID RUNTIME_ID CONTAINER_NAME <<<"$TARGET_INFO"

# --- Build SSM target ---
TARGET="ecs:${DB_CLUSTER}_${TASK_ID}_${RUNTIME_ID}"

echo ""
echo "=== Tunnel Configuration ==="
echo "  Environment: ${ENV}"
echo "  Cluster:     ${DB_CLUSTER}"
echo "  Service:     ${DB_API_SERVICE}"
echo "  Container:   ${CONTAINER_NAME}"
echo "  Task ID:     ${TASK_ID}"
echo "  RDS Host:    ${RDS_HOST}"
echo "  Local Port:  localhost:${LOCAL_PORT} -> ${RDS_HOST}:${RDS_PORT}"
echo ""
echo "Starting SSM tunnel... (Ctrl+C to stop)"
echo ""

# --- Start the tunnel ---
aws ssm start-session \
  --target "$TARGET" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"${RDS_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
