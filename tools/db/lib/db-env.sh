#!/usr/bin/env bash
# Shared by tools/db/migrate.sh and tools/db/tunnel.sh: which AWS environment a run targets, the checks that keep it
# on that environment, and the jump host for the SSM tunnel. Sourced, never run. Tested by tools/db/db-env.test.sh
# (pnpm check:ops).
#
# The names follow Terraform (infra/terraform/main.tf: local.prefix = "<project>-<env>"):
#   cluster      <project>-<env>-ecs-cluster
#   API service  <project>-<env>-ecs-service-api   the only jump host; the worker's ECS Exec is off
#   RDS host     <project>-<env>-rds-postgres.<id>.<region>.rds.amazonaws.com
# PROJECT is the Terraform `project` variable (default "app"); set PROJECT=<name> when yours differs.
#
# Neither script creates, grants or switches to a database role: they run `prisma migrate deploy` and the seeds as
# the one connection user in DATABASE_URL (tools/verify/check-no-db-roles.sh holds that).

# The DB_* variables are set here and read by the scripts that source this file.
# shellcheck disable=SC2034
DB_PROJECT="${PROJECT:-app}"

# db_env_configure <env> — sets DB_ENV, DB_CLUSTER, DB_API_SERVICE, DB_TUNNEL_PORT and DB_ENV_FILE_NAME for staging or
# production. Each AWS environment has its own tunnel port, so a staging tunnel left open is never taken for
# production. Returns 1 for any other value.
db_env_configure() {
  local env="$1"
  case "$env" in
    staging) DB_TUNNEL_PORT="5433" ;;
    production) DB_TUNNEL_PORT="5434" ;;
    *)
      echo "ERROR: unknown AWS environment '${env}' (expected staging or production)." >&2
      return 1
      ;;
  esac
  DB_ENV="$env"
  DB_CLUSTER="${DB_PROJECT}-${env}-ecs-cluster"
  DB_API_SERVICE="${DB_PROJECT}-${env}-ecs-service-api"
  DB_ENV_FILE_NAME=".env.aws.${env}"
}

# db_env_file_value <file> <key> — the value of KEY in an env file, quotes stripped; empty when absent.
db_env_file_value() {
  grep -E "^${2}=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true
}

# db_url_part <url> <hostname|port> — one part of a postgres URL, empty when it has none.
db_url_part() {
  DB_URL_FOR_PARSE="$1" python3 -c "import os, sys, urllib.parse as u; print(getattr(u.urlsplit(os.environ['DB_URL_FOR_PARSE'].strip().strip('\"')), sys.argv[1]) or '')" "$2"
}

# db_check_host <host> — the host must be one of this environment's RDS instances (<project>-<env>-…). A credentials
# file copied from another environment, or an RDS_HOST override pointing elsewhere, stops the run here.
db_check_host() {
  local host="$1" want="${DB_PROJECT}-${DB_ENV}-"
  if [[ -z "$host" ]]; then
    echo "ERROR: the database host is empty." >&2
    return 1
  fi
  if [[ "$host" != "$want"* ]]; then
    echo "ERROR: the database host '${host}' is not a ${want}* host, so it is not the ${DB_ENV} database." >&2
    echo "Refusing to run. Check DATABASE_URL in apps/backend/${DB_ENV_FILE_NAME} (or RDS_HOST), or set PROJECT." >&2
    return 1
  fi
}

# db_require_free_port <port> — an existing tunnel is never reused: whatever holds the port may point at another
# database. Returns 1 when something listens on it.
db_require_free_port() {
  local port="$1"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: port ${port} is already in use. An existing tunnel is never reused (it could point at another" >&2
    echo "database). Close it (tools/dev/kill-port.sh ${port}) and run again." >&2
    return 1
  fi
}

# db_is_interactive — true when stdin is a terminal. A function so the hermetic test can stand in for a terminal.
db_is_interactive() { [[ -t 0 ]]; }

# db_confirm_production <yes:true|false> — production always needs the word typed, even with --yes. With no terminal
# (CI) it needs both --yes and CONFIRM_ENV=production. Returns 1 to refuse.
db_confirm_production() {
  local yes="$1"
  if db_is_interactive; then
    local answer=""
    printf "  Type 'production' to proceed: " >&2
    read -r answer
    if [[ "$answer" != "production" ]]; then
      echo "Aborted: you did not type 'production'." >&2
      return 1
    fi
    return 0
  fi
  if [[ "$yes" == true && "${CONFIRM_ENV:-}" == "production" ]]; then
    echo "  Non-interactive production run confirmed (--yes and CONFIRM_ENV=production)." >&2
    return 0
  fi
  echo "ERROR: a production run with no terminal needs both --yes and CONFIRM_ENV=production." >&2
  return 1
}

# db_require_seed_password <env-file> — production seeding needs SUPER_ADMIN_PASSWORD in the environment's file, so
# the super-admin seed can never fall back to a known password. Exports it for the seed process.
db_require_seed_password() {
  local file="$1" value
  value=$(db_env_file_value "$file" SUPER_ADMIN_PASSWORD)
  if [[ -z "$value" ]]; then
    echo "ERROR: SUPER_ADMIN_PASSWORD must be set in ${file} before seeding production." >&2
    return 1
  fi
  export SUPER_ADMIN_PASSWORD="$value"
}

# db_find_api_task — prints "<task-id> <runtime-id> <container>" for a running task of the API service, preferring
# its `api` container. Only the API service is asked (`--service-name`): the worker is never a jump host.
db_find_api_task() {
  local arns tasks_json
  arns=$(aws ecs list-tasks \
    --cluster "$DB_CLUSTER" \
    --service-name "$DB_API_SERVICE" \
    --desired-status RUNNING \
    --query 'taskArns[*]' \
    --output text) || return 1
  if [[ -z "$arns" || "$arns" == "None" ]]; then
    echo "ERROR: no running task in service ${DB_API_SERVICE} (cluster ${DB_CLUSTER})." >&2
    return 1
  fi
  # shellcheck disable=SC2086,SC2016 # one argument per task ARN; the backticks are JMESPath, not shell
  tasks_json=$(aws ecs describe-tasks \
    --cluster "$DB_CLUSTER" \
    --tasks $arns \
    --query 'tasks[?lastStatus==`RUNNING`].{taskId:taskArn,containers:containers[*].{name:name,runtimeId:runtimeId}}' \
    --output json) || return 1
  printf '%s' "$tasks_json" | python3 -c "
import json, sys
tasks = json.load(sys.stdin) or []
for want in ('api', None):
    for task in tasks:
        task_id = task['taskId'].split('/')[-1]
        for c in task.get('containers') or []:
            if c.get('runtimeId') and (want is None or c.get('name') == want):
                print(task_id, c['runtimeId'], c['name'])
                sys.exit(0)
print('ERROR: no running container with a runtime id in the API service tasks.', file=sys.stderr)
sys.exit(1)
"
}

# db_tunnel_url <url> <port> — the URL with its host and port replaced by 127.0.0.1:<port>. Parsed, not
# pattern-matched: the URL may carry no port or a host in another case.
db_tunnel_url() {
  DB_URL_FOR_PARSE="$1" python3 -c "
import os, sys, urllib.parse as u
parts = u.urlsplit(os.environ['DB_URL_FOR_PARSE'].strip().strip('\"'))
if not parts.scheme or not parts.hostname:
    sys.exit(1)
userinfo, at, _ = parts.netloc.rpartition('@')
print(u.urlunsplit(parts._replace(netloc=userinfo + at + '127.0.0.1:' + sys.argv[1])))
" "$2"
}
