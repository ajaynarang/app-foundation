#!/usr/bin/env bash
# The operator scripts never create, grant or switch to a database role. The deploy workflow and tools/db/ run
# `prisma migrate deploy` and the seeds as the one connection user in DATABASE_URL; roles and policies belong to
# migrations alone. The starter removed its last extra role (`ai_reader`) by migration, and a script that still named
# it, or a new script that made a role, would break a database that no longer has one.
#
# Fails when any file under tools/, .github/, infra/ or scripts/ contains `ai_reader`, `CREATE ROLE` or `SET ROLE`
# (also `SET LOCAL ROLE` / `SET SESSION ROLE`), case-insensitive. This file and its test are the only exceptions.
#
#   check-no-db-roles.sh [root]   root defaults to the repo root
#
# Tested by check-no-db-roles.test.sh; both run in `pnpm check:ops`.
set -uo pipefail

root="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$root" || exit 2

pattern='ai_reader|create[[:space:]]+role|set[[:space:]]+((local|session)[[:space:]]+)?role'
dirs=()
for d in tools .github infra scripts; do
  [ -d "$d" ] && dirs+=("$d")
done
[ "${#dirs[@]}" -gt 0 ] || {
  echo "check-no-db-roles: no tools/, .github/, infra/ or scripts/ under $root"
  exit 0
}

hits=$(grep -rniE "$pattern" "${dirs[@]}" \
  --exclude=check-no-db-roles.sh --exclude=check-no-db-roles.test.sh \
  --exclude-dir=node_modules --exclude-dir=.terraform 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "check-no-db-roles: an operator file names a database role. Roles are made and dropped by migrations only:"
  echo "$hits"
  exit 1
fi
echo "check-no-db-roles: no operator file creates, grants or switches to a database role"
