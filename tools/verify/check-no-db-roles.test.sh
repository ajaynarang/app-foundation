#!/usr/bin/env bash
# Hermetic test of check-no-db-roles.sh on throwaway trees, then on this repo. Run by `pnpm check:ops`.
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-no-db-roles.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0

expect() { # <want: pass|fail> <name> <root>
  local got=fail
  if bash "$SCRIPT" "$3" >/dev/null 2>&1; then got=pass; fi
  if [ "$got" = "$1" ]; then echo "ok   $2"; else
    echo "FAIL $2 (wanted $1, got $got)"
    fails=$((fails + 1))
  fi
}

tree() { # <name>: a fresh tree with one clean file in each scanned folder
  local t="$work/$1"
  mkdir -p "$t/tools/db" "$t/.github/workflows" "$t/infra/terraform" "$t/scripts" "$t/docs"
  echo 'pnpm exec prisma migrate deploy' >"$t/tools/db/migrate.sh"
  echo 'run: pnpm exec prisma migrate deploy' >"$t/.github/workflows/deploy.yml"
  echo 'resource "aws_db_instance" "main" {}' >"$t/infra/terraform/rds.tf"
  echo 'echo ok' >"$t/scripts/x.sh"
  echo "$t"
}

expect pass "a tree with no role statement" "$(tree clean)"

t=$(tree ai-reader)
echo 'psql -c "GRANT SELECT ON conversations TO ai_reader"' >>"$t/tools/db/migrate.sh"
expect fail "a script naming ai_reader" "$t"

t=$(tree create-role)
echo '  run: psql -c "create role reporting login"' >>"$t/.github/workflows/deploy.yml"
expect fail "a workflow creating a role (any case)" "$t"

t=$(tree set-local-role)
echo 'SET LOCAL ROLE app_reader;' >"$t/infra/terraform/bootstrap.sql"
expect fail "infra switching role (SET LOCAL ROLE)" "$t"

t=$(tree set-role)
echo 'psql -c "SET ROLE admin"' >>"$t/scripts/x.sh"
expect fail "a root script switching role (SET ROLE)" "$t"

t=$(tree docs-only)
echo 'The migration drops the ai_reader role.' >"$t/docs/note.md"
expect pass "docs may describe the role (docs/ is not scanned)" "$t"

expect pass "this repository" "$(cd "$(dirname "$0")/../.." && pwd)"

[ "$fails" -eq 0 ] || exit 1
