#!/usr/bin/env bash
#
# Print the address of the docker compose Postgres that is running now, built
# from the container itself (user, password, database, published port), never
# from an env file that may be out of date. Used by install.sh and
# cloud-dev-up.sh:  export DATABASE_URL="$(tools/dev/local-db-url.sh)"

set -euo pipefail
cd "$(dirname "$0")/../.."

pg_env() { docker compose exec -T postgres printenv "$1"; }
port="$(docker compose port postgres 5432 | awk -F: '{print $NF}')"
echo "postgresql://$(pg_env POSTGRES_USER):$(pg_env POSTGRES_PASSWORD)@localhost:${port}/$(pg_env POSTGRES_DB)"
