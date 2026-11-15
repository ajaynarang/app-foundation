#!/usr/bin/env bash
# Hermetic test of tools/db/migrate.sh, tools/db/tunnel.sh and their shared lib/db-env.sh. The scripts run in a copy
# of the tree with aws, lsof, pg_isready, pnpm and npx stubbed on the PATH: nothing reaches AWS or a database. Run by
# `pnpm check:ops`.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0

ok() { echo "ok   $1"; }
fail() {
  echo "FAIL $1"
  fails=$((fails + 1))
}
check() { # <name> <command...>: passes when the command succeeds
  local name=$1
  shift
  if "$@"; then ok "$name"; else fail "$name"; fi
}
refuses() { # <name> <command...>: passes when the command fails
  local name=$1
  shift
  if "$@" >/dev/null 2>&1; then fail "$name (it succeeded)"; else ok "$name"; fi
}

# --- a copy of the tree the scripts expect: tools/db, apps/backend, packages/appshore/db ---
repo="$work/repo"
mkdir -p "$repo/tools/db/lib" "$repo/apps/backend" "$repo/packages/appshore/db"
cp "$HERE/migrate.sh" "$HERE/tunnel.sh" "$repo/tools/db/"
cp "$HERE/lib/db-env.sh" "$repo/tools/db/lib/"

STAGING_URL='postgresql://u:p@app-staging-rds-postgres.abc123.us-east-1.rds.amazonaws.com:5432/app'
PRODUCTION_URL='postgresql://u:p@app-production-rds-postgres.abc123.us-east-1.rds.amazonaws.com:5432/app'

# --- stubs ---
bin="$work/bin"
mkdir -p "$bin"
CALLS="$work/calls.log"
cat >"$bin/aws" <<'EOF'
#!/usr/bin/env bash
echo "aws $*" >>"$CALLS"
case "$1 $2" in
  "sts get-caller-identity") exit 0 ;;
  "ecs list-tasks") echo "arn:aws:ecs:us-east-1:111111111111:task/cluster/apitask1" ;;
  "ecs describe-tasks")
    echo '[{"taskId":"arn:aws:ecs:us-east-1:111111111111:task/cluster/apitask1","containers":[{"name":"sidecar","runtimeId":"rt-side"},{"name":"api","runtimeId":"rt-api"}]}]'
    ;;
  "ssm start-session") exit 0 ;;
  *) exit 0 ;;
esac
EOF
cat >"$bin/lsof" <<'EOF'
#!/usr/bin/env bash
[ "${STUB_PORT_BUSY:-0}" = "1" ]
EOF
cat >"$bin/pg_isready" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$bin/pnpm" <<'EOF'
#!/usr/bin/env bash
echo "pnpm $* | ENV_TYPE=${ENV_TYPE:-} | SUPER_ADMIN_PASSWORD=${SUPER_ADMIN_PASSWORD:+set} | DATABASE_URL=${DATABASE_URL:-}" >>"$CALLS"
# Real pnpm always prints; the scripts filter its output through grep.
case "$*" in
  *"migrate deploy"*) echo "No pending migrations to apply." ;;
  *) echo "stub: pnpm $1" ;;
esac
exit 0
EOF
cat >"$bin/npx" <<'EOF'
#!/usr/bin/env bash
echo "npx $*" >>"$CALLS"
EOF
chmod +x "$bin"/*
export PATH="$bin:$PATH" CALLS TUNNEL_SETTLE_SECONDS=0
unset CONFIRM_ENV SUPER_ADMIN_PASSWORD RDS_HOST RDS_PORT PROJECT STUB_PORT_BUSY

write_env_file() { # <env> <url> [extra line]
  {
    echo "DATABASE_URL=\"$2\""
    [ -n "${3:-}" ] && echo "$3"
  } >"$repo/apps/backend/.env.aws.$1"
}

run_migrate() { : >"$CALLS"; bash "$repo/tools/db/migrate.sh" "$@" </dev/null >"$work/out.log" 2>&1; }
run_tunnel() { : >"$CALLS"; bash "$repo/tools/db/tunnel.sh" "$@" </dev/null >"$work/out.log" 2>&1; }
called() { grep -q -- "$1" "$CALLS"; }
not_called() { ! grep -q -- "$1" "$CALLS"; }
line_of() { grep -n -- "$1" "$CALLS" | head -1 | cut -d: -f1; }
after() { # <later> <earlier>: the first call matching <later> comes after the first matching <earlier>
  local a b
  a=$(line_of "$1")
  b=$(line_of "$2")
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -gt "$b" ]
}

# ─── lib/db-env.sh ───
# shellcheck source=lib/db-env.sh
source "$repo/tools/db/lib/db-env.sh"

db_env_configure staging
check "staging: cluster, API service and tunnel port" \
  test "$DB_CLUSTER $DB_API_SERVICE $DB_TUNNEL_PORT $DB_ENV_FILE_NAME" = \
  "app-staging-ecs-cluster app-staging-ecs-service-api 5433 .env.aws.staging"
db_env_configure production
check "production: cluster, API service and its own tunnel port" \
  test "$DB_CLUSTER $DB_API_SERVICE $DB_TUNNEL_PORT $DB_ENV_FILE_NAME" = \
  "app-production-ecs-cluster app-production-ecs-service-api 5434 .env.aws.production"
refuses "an unknown environment is refused" db_env_configure prod

db_env_configure production
check "a production host passes the production check" db_check_host "app-production-rds-postgres.abc.us-east-1.rds.amazonaws.com"
refuses "a staging host fails the production check" db_check_host "app-staging-rds-postgres.abc.us-east-1.rds.amazonaws.com"
refuses "a host of another project fails" db_check_host "other-production-rds-postgres.abc.us-east-1.rds.amazonaws.com"
refuses "an empty host fails" db_check_host ""
check "PROJECT names the prefix" bash -c "PROJECT=acme source '$repo/tools/db/lib/db-env.sh' && db_env_configure production &&
  db_check_host acme-production-rds-postgres.x.rds.amazonaws.com && ! db_check_host app-production-rds-postgres.x.rds.amazonaws.com 2>/dev/null"

check "with no terminal, --yes and CONFIRM_ENV=production confirm production" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; CONFIRM_ENV=production db_confirm_production true </dev/null 2>/dev/null"
refuses "with no terminal, --yes alone does not confirm production" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; db_confirm_production true </dev/null"
refuses "with no terminal, CONFIRM_ENV alone does not confirm production" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; CONFIRM_ENV=production db_confirm_production false </dev/null"
check "at a terminal, typing production confirms" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; db_is_interactive() { true; }; echo production | db_confirm_production false 2>/dev/null"
refuses "at a terminal, --yes does not skip typing production" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; db_is_interactive() { true; }; echo y | CONFIRM_ENV=production db_confirm_production true"

check "a free port passes" db_require_free_port 5434
refuses "a port already in use is never reused" env STUB_PORT_BUSY=1 bash -c "source '$repo/tools/db/lib/db-env.sh'; db_require_free_port 5434"

printf 'SUPER_ADMIN_PASSWORD="s3cret"\n' >"$work/with-password.env"
printf 'DATABASE_URL=x\n' >"$work/without-password.env"
check "the seed password is read from the env file" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; db_require_seed_password '$work/with-password.env' && [ \"\$SUPER_ADMIN_PASSWORD\" = s3cret ]"
refuses "production seeding without SUPER_ADMIN_PASSWORD is refused" \
  bash -c "source '$repo/tools/db/lib/db-env.sh'; db_require_seed_password '$work/without-password.env'"

: >"$CALLS"
db_env_configure staging
check "the jump host is the API service's api container" test "$(db_find_api_task)" = "apitask1 rt-api api"
check "the task list is asked of the API service only" called "aws ecs list-tasks --cluster app-staging-ecs-cluster --service-name app-staging-ecs-service-api"
check "the tunnel URL points at localhost" \
  test "$(db_tunnel_url "$PRODUCTION_URL" 5434)" = "postgresql://u:p@127.0.0.1:5434/app"
check "a URL with no port gets the tunnel port" \
  test "$(db_tunnel_url 'postgresql://u:p@Host.Example/app?schema=public' 5433)" = "postgresql://u:p@127.0.0.1:5433/app?schema=public"

# ─── migrate.sh ───
run_migrate --env local --yes --no-langfuse
check "local full: runs" test $? -eq 0
check "local full: seed:knowledge runs after the base seeds" after "seed:knowledge" "prisma/seeds/index.ts"
check "local full: seeds run after migrate deploy" after "prisma/seeds/index.ts" "migrate deploy"

run_migrate --env local --seed-only --yes
check "local seed-only: runs" test $? -eq 0
check "local seed-only: seed:knowledge runs after the base seeds" after "seed:knowledge" "prisma/seeds/index.ts"
check "local seed-only: no migration" not_called "migrate deploy"

refuses "--container is gone" run_migrate --env staging --container worker --yes

write_env_file production "$PRODUCTION_URL" 'SUPER_ADMIN_PASSWORD="s3cret"'
run_migrate --env production --yes --no-langfuse
code=$?
check "production with --yes but no CONFIRM_ENV and no terminal: refused" test "$code" -ne 0
check "production refused: no migration ran" not_called "migrate deploy"

write_env_file production "$PRODUCTION_URL"
CONFIRM_ENV=production run_migrate --env production --yes --no-langfuse
code=$?
check "production seeding without SUPER_ADMIN_PASSWORD: refused" test "$code" -ne 0
check "refused before anything is touched (no tunnel, no migration)" \
  bash -c "! grep -q 'ssm start-session' '$CALLS' && ! grep -q 'migrate deploy' '$CALLS'"
CONFIRM_ENV=production run_migrate --env production --migrate-only --yes
check "production migrate-only needs no seed password" test $? -eq 0

write_env_file production "$PRODUCTION_URL" 'SUPER_ADMIN_PASSWORD="s3cret"'
CONFIRM_ENV=production run_migrate --env production --yes --no-langfuse
check "production full with --yes and CONFIRM_ENV=production: runs" test $? -eq 0
check "production: migrations applied through the tunnel on 5434" called "migrate deploy | ENV_TYPE= | SUPER_ADMIN_PASSWORD=set | DATABASE_URL=postgresql://u:p@127.0.0.1:5434/app"
check "production: seeds run with ENV_TYPE=production and the super-admin password" called "prisma/seeds/index.ts | ENV_TYPE=production | SUPER_ADMIN_PASSWORD=set"
check "production full: seed:knowledge runs after the base seeds" after "seed:knowledge" "prisma/seeds/index.ts"
check "production: the jump host comes from the API service" called "--service-name app-production-ecs-service-api"
check "production: the tunnel forwards to the production host" called '"localPortNumber":\["5434"\]'
check "production: never --reset" not_called "--reset"

CONFIRM_ENV=production run_migrate --env production --seed-only --yes
check "production seed-only: runs" test $? -eq 0
check "production seed-only: seed:knowledge runs after the base seeds" after "seed:knowledge" "prisma/seeds/index.ts"

write_env_file staging "$PRODUCTION_URL"
run_migrate --env staging --yes
code=$?
check "staging with a production URL in .env.aws.staging: refused" test "$code" -ne 0
check "host mismatch: no tunnel opened" not_called "ssm start-session"

write_env_file staging "$STAGING_URL"
STUB_PORT_BUSY=1 run_migrate --env staging --yes
code=$?
check "staging with the tunnel port already in use: refused, never reused" test "$code" -ne 0
check "busy port: no migration ran" not_called "migrate deploy"

run_migrate --env staging --yes --no-langfuse
check "staging full: runs" test $? -eq 0
check "staging: tunnel on 5433 through the API service" \
  bash -c "grep -q -- '--service-name app-staging-ecs-service-api' '$CALLS' && grep -q '\"localPortNumber\":\[\"5433\"\]' '$CALLS'"
check "staging full: seed:knowledge runs after the base seeds" after "seed:knowledge" "prisma/seeds/index.ts"

run_migrate --env production --status
check "production --status reads without confirmation" test $? -eq 0

# ─── tunnel.sh ───
write_env_file staging "$STAGING_URL"
run_tunnel
check "tunnel: staging opens" test $? -eq 0
check "tunnel: through the API service's api container on 5433" \
  bash -c "grep -q -- '--service-name app-staging-ecs-service-api' '$CALLS' && grep -q 'ecs:app-staging-ecs-cluster_apitask1_rt-api' '$CALLS' && grep -q '\"localPortNumber\":\[\"5433\"\]' '$CALLS'"
refuses "tunnel: --container is gone" run_tunnel --container worker

write_env_file production "$PRODUCTION_URL"
run_tunnel --env production
code=$?
check "tunnel: production with no terminal is refused" test "$code" -ne 0
check "tunnel: refused production opened nothing" not_called "ssm start-session"

write_env_file production "$STAGING_URL"
CONFIRM_ENV=production run_tunnel --env production
code=$?
check "tunnel: a staging host for --env production is refused" test "$code" -ne 0

write_env_file staging "$STAGING_URL"
STUB_PORT_BUSY=1 run_tunnel
code=$?
check "tunnel: a local port already in use is refused" test "$code" -ne 0

[ "$fails" -eq 0 ] || {
  echo "db-env.test.sh: $fails failed"
  exit 1
}
