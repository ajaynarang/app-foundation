#!/usr/bin/env bash
# Hermetic test of tools/db/pull-staging.sh. It runs in a copy of the tree with aws, lsof, pg_isready, pg_dump,
# pg_restore, psql, dropdb, createdb and pnpm stubbed on the PATH: nothing reaches AWS or a database. Run by
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
check() {
  local name=$1
  shift
  if "$@"; then ok "$name"; else fail "$name"; fi
}
quiet() { "$@" >/dev/null 2>&1; }
refuses() {
  local name=$1
  shift
  if "$@" >/dev/null 2>&1; then fail "$name (it succeeded)"; else ok "$name"; fi
}

repo="$work/repo"
mkdir -p "$repo/tools/db/lib" "$repo/apps/backend" "$repo/packages/appshore/db"
cp "$HERE/pull-staging.sh" "$repo/tools/db/"
cp "$HERE/lib/db-env.sh" "$repo/tools/db/lib/"
SCRIPT="$repo/tools/db/pull-staging.sh"

STAGING_URL='postgresql://u:p@app-staging-rds-postgres.abc123.us-east-1.rds.amazonaws.com:5432/app?schema=public'
PRODUCTION_URL='postgresql://u:p@app-production-rds-postgres.abc123.us-east-1.rds.amazonaws.com:5432/app'

bin="$work/bin"
mkdir -p "$bin"
CALLS="$work/calls.log"
cat >"$bin/aws" <<'EOF'
#!/usr/bin/env bash
echo "aws $*" >>"$CALLS"
case "$1 $2" in
  "ecs list-tasks") echo "arn:aws:ecs:us-east-1:111111111111:task/cluster/apitask1" ;;
  "ecs describe-tasks")
    echo '[{"taskId":"arn:aws:ecs:us-east-1:111111111111:task/cluster/apitask1","containers":[{"name":"api","runtimeId":"rt-api"}]}]'
    ;;
  "ssm start-session") exec sleep 5 ;;
esac
exit 0
EOF
cat >"$bin/lsof" <<'EOF'
#!/usr/bin/env bash
[ "${STUB_PORT_BUSY:-0}" = "1" ]
EOF
cat >"$bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
echo "pg_dump $*" >>"$CALLS"
out=""
while [ $# -gt 0 ]; do [ "$1" = "-f" ] && out="$2"; shift; done
[ -n "$out" ] && echo dump >"$out"
exit 0
EOF
for tool in pg_restore psql dropdb createdb; do
  printf '#!/usr/bin/env bash\necho "%s $*" >>"$CALLS"\nexit 0\n' "$tool" >"$bin/$tool"
done
printf '#!/usr/bin/env bash\nexit 0\n' >"$bin/pg_isready"
cat >"$bin/pnpm" <<'EOF'
#!/usr/bin/env bash
echo "pnpm $* | DATABASE_URL=${DATABASE_URL:-}" >>"$CALLS"
exit 0
EOF
chmod +x "$bin"/*
export PATH="$bin:$PATH" CALLS TUNNEL_SETTLE_SECONDS=0 PULL_STAGING_DUMP_DIR="$work/dumps"
unset RDS_HOST RDS_PORT PROJECT STUB_PORT_BUSY

env_file() { printf 'DATABASE_URL=%s\n' "$1" >"$repo/apps/backend/.env.aws.staging"; }
reset_calls() { : >"$CALLS"; }
called() { grep -q -- "$1" "$CALLS"; }
not_called() { ! grep -q -- "$1" "$CALLS"; }

# --- refusals, before any AWS call ---
env_file "$STAGING_URL"
reset_calls
refuses "refuses --env production" bash "$SCRIPT" --env production --yes
refuses "refuses --env local" bash "$SCRIPT" --env local --yes
refuses "refuses the dev database as a target" bash "$SCRIPT" --target dev --yes
check "a refused environment makes no AWS call" not_called "aws "

env_file "$PRODUCTION_URL"
reset_calls
refuses "refuses a staging env file that holds a production host" bash "$SCRIPT" --yes
check "the host check runs before any AWS call" not_called "aws "
check "the host check runs before any dump" not_called "pg_dump"

env_file "$STAGING_URL"
reset_calls
refuses "refuses when the tunnel port is busy (never reuses a tunnel)" env STUB_PORT_BUSY=1 bash "$SCRIPT" --yes
check "a busy port dumps nothing" not_called "pg_dump"

rm -rf "$work/dumps"
refuses "restore-only refuses with no dump" bash "$SCRIPT" --restore-only --yes

# --- a full run ---
env_file "$STAGING_URL"
reset_calls
check "a full run succeeds" quiet bash "$SCRIPT" --yes
check "the jump host is the API service" called "ecs list-tasks --cluster app-staging-ecs-cluster --service-name app-staging-ecs-service-api"
check "the dump drops owners" called "pg_dump .*--no-owner"
check "the dump drops privileges" called "pg_dump .*--no-privileges"
check "the dump goes through the staging tunnel port, without Prisma's query string" \
  called "pg_dump postgresql://u:p@127.0.0.1:5433/app --format"
check "the dump lands in the gitignored dump folder" test -L "$work/dumps/latest.dump"
check "the restore drops owners and privileges" called "pg_restore .*-p 5495 .*--no-owner --no-privileges"
check "the database dropped is the stg-debug one" called "dropdb -h localhost -p 5495"
check "migrate deploy runs on stg-debug" called "prisma migrate deploy | DATABASE_URL=postgresql://postgres:postgres@localhost:5495/app"
check "the dev database (5499) is never touched" not_called "5499"
check "no role is created" not_called "CREATE ROLE"

reset_calls
check "the default dump folder is tools/.dumps" grep -q 'DUMP_DIR="${PULL_STAGING_DUMP_DIR:-$TOOLS_DIR/.dumps}"' "$HERE/pull-staging.sh"
check "the dump folder is gitignored" git -C "$HERE/../.." check-ignore -q tools/.dumps/staging-20260101-000000.dump

reset_calls
check "restore-only restores the latest dump" quiet bash "$SCRIPT" --restore-only --skip-migrate --yes
check "restore-only made no AWS call" not_called "aws "
check "--skip-migrate skips migrate deploy" not_called "migrate deploy"

if [ "$fails" -gt 0 ]; then
  echo "pull-staging.test: $fails failure(s)"
  exit 1
fi
echo "pull-staging.test: all passed"
