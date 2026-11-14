#!/usr/bin/env bash
# Hermetic test of the RBAC gap audit (tests/scripts/audit-rbac-gaps.ts, root script `pnpm audit:rbac`), run against
# controllers written to a temp folder. The audit fails a run when a mutation route has neither @Roles() nor
# @Public(), so it must read every decorator of a route, wherever it sits in the decorator block, and it must fail
# (not pass) when it cannot run. No git, no database. Run by `pnpm check:ops`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AUDIT="$ROOT/tests/scripts/audit-rbac-gaps.ts"
TSX="$ROOT/node_modules/.bin/tsx"
if [ ! -x "$TSX" ]; then
  echo "skip: tsx is not installed (run pnpm install)"
  exit 0
fi
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
fails=0

controller() { # <name> <body>; one controller per case, in its own backend tree
  mkdir -p "$work/$1/src/domains/things" "$work/$1/api"
  printf '%s\n' "$2" >"$work/$1/src/domains/things/things.controller.ts"
}

expect() { # <want exit: 0|1> <case> <name>
  local got=0
  RBAC_REPORT_DIR="$work/reports" BACKEND_SRC="$work/$2/src" TESTS_API="$work/$2/api" "$TSX" "$AUDIT" --ci >"$work/$2.log" 2>&1 || got=$?
  [ "$got" -ne 0 ] && got=1
  if [ "$got" = "$1" ]; then echo "ok   $3"; else
    echo "FAIL $3 (wanted exit $1, got $got)"
    sed 's/^/     /' "$work/$2.log" | tail -20
    fails=$((fails + 1))
  fi
}

controller roles-below "@Controller('things')
export class ThingsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a thing',
  })
  create() {}

  @Delete(':thing_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a thing' })
  @ApiParam({ name: 'thing_id', description: 'Thing id' })
  @Roles(UserRole.OWNER)
  remove() {}
}"
expect 0 roles-below "@Roles() below the route decorator, after other decorators, guards the route"

controller public-below "@Controller('/')
export class RootController {
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A public endpoint',
  })
  @Public()
  @UseGuards(SomeGuard)
  handle() {}
}"
expect 0 public-below "@Public() below the route decorator marks the route public"

controller unguarded "@Controller('things')
export class ThingsController {
  @Get()
  @Roles(UserRole.OWNER)
  list() {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create() {}
}"
expect 1 unguarded "a mutation with neither @Roles() nor @Public() fails the run"

controller neighbour "@Controller('things')
export class ThingsController {
  @Post('a')
  @Roles(UserRole.OWNER)
  a() {
    return 1;
  }
  @Post('b')
  b() {}
}"
expect 1 neighbour "the previous route's @Roles() does not cover the next route"

controller class-level "@Controller('things')
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ThingsController {
  @Post()
  create() {}
}"
expect 0 class-level "@Roles() on the class covers its routes"

got=0
RBAC_REPORT_DIR="$work/reports" BACKEND_SRC="$work/does-not-exist" TESTS_API="$work/does-not-exist" "$TSX" "$AUDIT" --ci >"$work/crash.log" 2>&1 || got=$?
if [ "$got" -ne 0 ]; then echo "ok   an audit that cannot read the backend fails the run"; else
  echo "FAIL an audit that cannot read the backend fails the run (exit 0)"
  fails=$((fails + 1))
fi

[ "$fails" -eq 0 ] || exit 1
