#!/usr/bin/env bash
# pnpm verify:api — the running-backend check. Run it before opening a pull request that changes the wire
# (a status code, a route, a response or error body), and paste its result line into the pull request body.
#
# What it does: builds the backend, applies migrations, seeds, starts the built backend, runs the Playwright
# `api` project against it (smoke, the RBAC matrix, and anything under tests/api/), then stops the backend.
# The unit suites cannot see a status that moved while a QA caller still expects the old one. This can.
#
# It needs Postgres and Redis, and it migrates and seeds the database it is given. So it never guesses them: a
# default port can belong to another project's container on the same machine. Both must be set, or it stops before
# doing anything. For the local compose ones (`docker compose up -d postgres redis`), export the two values from
# apps/backend/.env.example.
#
#   DATABASE_URL   required. The Postgres this run migrates, seeds and tests against.
#   REDIS_URL      required. The Redis the backend uses for this run.
#   API_QA_PORT    default 8000. The port the backend listens on for this run.
#   TENANT_ID      default demo (the seeded tenant)
#   DEV_AUTH_SECRET  default: a random value made for this run. The QA suite signs in through /dev/switch with it.
#
# No third-party key is needed: the backend boots without Stripe, Anthropic, Twilio or Firebase.
set -uo pipefail

cd "$(dirname "$0")/../.."

missing=()
[ -n "${DATABASE_URL:-}" ] || missing+=(DATABASE_URL)
[ -n "${REDIS_URL:-}" ] || missing+=(REDIS_URL)
if [ "${#missing[@]}" -gt 0 ]; then
  names=$(IFS=,; echo "${missing[*]}" | sed 's/,/, /g')
  echo "verify:api: ${names} not set. This run migrates and seeds the database it is given, so it never guesses one." >&2
  echo "Export both (the local compose values are in apps/backend/.env.example) and run it again." >&2
  exit 2
fi
export DATABASE_URL REDIS_URL
export DEV_AUTH_SECRET="${DEV_AUTH_SECRET:-$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))")}"
export TENANT_ID="${TENANT_ID:-demo}"
port="${API_QA_PORT:-8000}"
export API_BASE_URL="http://localhost:${port}/api/v1"

log="$(mktemp -t api-qa-backend.XXXXXX)"
backend_pid=""
step=""
started=$(date +%s)

finish() {
  local code=$?
  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null
    wait "$backend_pid" 2>/dev/null
  fi
  local elapsed=$(( $(date +%s) - started ))
  echo
  if [ "$code" -eq 0 ]; then
    rm -f "$log"
    echo "verify:api: PASS (${elapsed}s)"
  elif [ -s "$log" ]; then
    echo "verify:api: FAIL at \"${step}\" (${elapsed}s). Backend log: ${log}"
  else
    rm -f "$log"
    echo "verify:api: FAIL at \"${step}\" (${elapsed}s)"
  fi
  exit "$code"
}
trap finish EXIT

run() {
  step="$1"
  shift
  echo
  echo "── verify:api: ${step} ──"
  "$@" || exit 1
}

# Another process on the port would answer the suite in place of the backend built here.
port_is_free() {
  node -e "
    const socket = require('net').connect(Number(process.argv[1]), 'localhost');
    socket.on('connect', () => process.exit(1));
    socket.on('error', () => process.exit(0));
  " "$port"
}

start_backend() {
  # Not production: the /dev routes the suite signs in through do not exist there.
  (
    cd apps/backend &&
      NODE_ENV=development ENV_TYPE=development PORT="$port" LOG_LEVEL="${LOG_LEVEL:-WARN}" exec node dist/main
  ) >"$log" 2>&1 &
  backend_pid=$!
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null --max-time 2 "${API_BASE_URL}/health/live"; then return 0; fi
    if ! kill -0 "$backend_pid" 2>/dev/null; then
      echo "The backend exited while starting. Last lines of its log:"
      tail -n 40 "$log"
      return 1
    fi
    sleep 1
  done
  echo "The backend did not answer ${API_BASE_URL}/health/live within 60 seconds. Last lines of its log:"
  tail -n 40 "$log"
  return 1
}

step="port check"
if ! port_is_free; then
  echo "Port ${port} is already in use. Stop what listens there, or set API_QA_PORT to a free port."
  exit 1
fi

run "build" pnpm exec turbo run build --filter=@app/backend... --output-logs=errors-only
run "migrate" pnpm --filter @appshore/db prisma:migrate:deploy
run "seed" pnpm --filter @appshore/db db:seed
run "start backend" start_backend
run "api suite" pnpm --filter @app/qa exec playwright test --project=api
