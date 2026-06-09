#!/usr/bin/env bash
#
# Opens an SSM port-forwarding tunnel to the staging RDS PostgreSQL database.
#
# What this does:
#   1. Finds a running ECS task in the staging cluster (uses it as a "jump host")
#   2. Builds the SSM target string from the task ID + container runtime ID
#   3. Starts an SSM port-forwarding session that tunnels through the ECS task
#      to the private RDS instance
#
# After running, connect to the DB at: localhost:5433
#
# Usage:
#   ./db-tunnel.sh              # Uses first available container (worker preferred)
#   ./db-tunnel.sh --container api   # Use the api container specifically
#   ./db-tunnel.sh --local-port 5434 # Use a different local port

set -euo pipefail

# --- Configuration (change these if infra changes) ---
CLUSTER="app-staging-ecs-cluster"
RDS_HOST="app-staging-rds-postgres.cb4sy4ym62k1.us-east-1.rds.amazonaws.com"
RDS_PORT="5432"
LOCAL_PORT="5433"
PREFERRED_CONTAINER="worker"  # worker or api — either works as a jump host

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --container)
      PREFERRED_CONTAINER="$2"
      shift 2
      ;;
    --local-port)
      LOCAL_PORT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--container worker|api] [--local-port PORT]"
      echo ""
      echo "Opens an SSM tunnel to staging RDS via an ECS container."
      echo "Connect to the DB at localhost:<local-port> (default: 5433)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# --- Fetch running tasks ---
echo "Finding running ECS tasks in ${CLUSTER}..."

TASK_ARNS=$(aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --desired-status RUNNING \
  --query 'taskArns[*]' \
  --output text 2>&1)

if [[ -z "$TASK_ARNS" || "$TASK_ARNS" == "None" ]]; then
  echo "ERROR: No running tasks found in cluster ${CLUSTER}"
  exit 1
fi

# --- Describe tasks to get container runtime IDs ---
echo "Fetching task details..."

TASKS_JSON=$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks $TASK_ARNS \
  --query 'tasks[?lastStatus==`RUNNING`].{taskId:taskArn,containers:containers[*].{name:name,runtimeId:runtimeId}}' \
  --output json)

# --- Pick the right container ---
# Try preferred container first, fall back to any available one
TARGET_INFO=$(echo "$TASKS_JSON" | python3 -c "
import json, sys

tasks = json.load(sys.stdin)
preferred = '${PREFERRED_CONTAINER}'

# Try preferred container first
for task in tasks:
    task_id = task['taskId'].split('/')[-1]
    for container in task['containers']:
        if container['name'] == preferred:
            print(f\"{task_id} {container['runtimeId']} {container['name']}\")
            sys.exit(0)

# Fall back to any container
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

# --- Build SSM target ---
TARGET="ecs:${CLUSTER}_${TASK_ID}_${RUNTIME_ID}"

echo ""
echo "=== Tunnel Configuration ==="
echo "  Cluster:    ${CLUSTER}"
echo "  Container:  ${CONTAINER_NAME}"
echo "  Task ID:    ${TASK_ID}"
echo "  Runtime ID: ${RUNTIME_ID}"
echo "  RDS Host:   ${RDS_HOST}"
echo "  Local Port: localhost:${LOCAL_PORT} -> ${RDS_HOST}:${RDS_PORT}"
echo ""
echo "Starting SSM tunnel... (Ctrl+C to stop)"
echo ""

# --- Start the tunnel ---
aws ssm start-session \
  --target "$TARGET" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"${RDS_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}"
