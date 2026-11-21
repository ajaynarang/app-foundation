#!/usr/bin/env bash
#
# Bring a Claude Code cloud session up to where a local machine already is:
# Docker and the compose services running, the database migrated to this
# branch, and the Doppler CLI pointed at the dev configs. Run it once at the
# start of each cloud session; safe to run again. The environment's setup
# script has already run tools/dev/install.sh on this machine.
#
# Local machines do not need this: they have Docker Desktop and `doppler login`.
#
# Doppler: each app directory's doppler.yaml names its project
# (<product>-backend, <product>-frontend, ...). That project's read-only service
# token is saved on the cloud environment as DOPPLER_TOKEN_<LAST PART>, for
# example DOPPLER_TOKEN_BACKEND and DOPPLER_TOKEN_FRONTEND. The backend token
# also covers the repo root, for the `pnpm test:*:local` scripts.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

tools/dev/docker-up.sh
until docker compose exec -T postgres pg_isready -q; do sleep 1; done

scope_doppler_token() {
  local variable="$1" directory="$2"
  local token="${!variable:-}"
  if [ -z "$token" ]; then
    echo "  $variable is not set, so $directory gets no Doppler secrets."
    return
  fi
  doppler configure set token "$token" --scope "$directory" --silent
  echo "  Doppler ready for $directory"
}

echo "Doppler:"
if command -v doppler >/dev/null 2>&1; then
  scope_doppler_token DOPPLER_TOKEN_BACKEND "$ROOT"
  for file in apps/*/doppler.yaml; do
    [ -f "$file" ] || continue
    project="$(awk '/project:/ {print $2; exit}' "$file")"
    suffix="$(printf '%s' "${project##*-}" | tr '[:lower:]' '[:upper:]')"
    scope_doppler_token "DOPPLER_TOKEN_${suffix}" "$ROOT/$(dirname "$file")"
  done
else
  echo "  The Doppler CLI is not installed; skipping."
fi

# The setup script built and migrated the default branch; bring both to this one.
echo "Building the Prisma client and packages, then migrating..."
pnpm --filter @appshore/db prisma:generate >/dev/null
pnpm --filter @app/shared-types --filter @appshore/kernel --filter @appshore/db --filter @appshore/platform build >/dev/null
DATABASE_URL="$(tools/dev/local-db-url.sh)"
export DATABASE_URL
pnpm --filter @appshore/db prisma:migrate:deploy

echo
echo "Ready. Next: pnpm doppler:backend   and   pnpm doppler:frontend"
