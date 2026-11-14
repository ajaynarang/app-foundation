#!/usr/bin/env bash
# The local gates hold what CI would (CI is manual-only), so their steps must not drop out unnoticed: this checks
# that `pnpm verify` (tools/verify/verify.sh) still runs each of its steps and ends with result-line.sh, and that
# the pre-push hook still runs the architecture specs, the ops checks and the repository guards, and the pre-commit
# hook the guards. Reads files only. Run by `pnpm check:ops`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERIFY="$ROOT/tools/verify/verify.sh"
PRE_PUSH="$ROOT/.husky/pre-push"
PRE_COMMIT="$ROOT/.husky/pre-commit"
fails=0

has() { # <file> <fixed string> <name>
  if grep -qF -- "$2" "$1"; then echo "ok   $3"; else
    echo "FAIL $3: $(basename "$1") no longer has: $2"
    fails=$((fails + 1))
  fi
}

has "$VERIFY" 'run "format check" pnpm format:check' "verify runs the format check"
has "$VERIFY" 'pnpm format:check:root' "verify runs the format check outside packages"
has "$VERIFY" 'run "lint" pnpm lint' "verify runs lint"
has "$VERIFY" 'run "schema lint" pnpm lint:schema' "verify runs the schema lint"
has "$VERIFY" 'run "type-check" pnpm type-check' "verify runs type-check"
has "$VERIFY" 'turbo run test --filter=!@app/qa' "verify runs every unit suite through turbo"
has "$VERIFY" 'pnpm test:init-app' "verify runs the init-app tool tests"
has "$VERIFY" 'run "ops checks" pnpm check:ops' "verify runs check:ops"
has "$VERIFY" 'run "rbac audit" pnpm audit:rbac' "verify runs the RBAC gap audit"
has "$VERIFY" 'run "build" pnpm build' "verify runs the build"
has "$VERIFY" 'run "guards" pnpm guards' "verify runs the repository guards"
has "$VERIFY" 'run "guard tests" pnpm test:guards' "verify runs the guards' own tests"
has "$VERIFY" 'tools/verify/result-line.sh verify' "verify ends with the result line"
has "$PRE_PUSH" 'pnpm verify:arch' "pre-push runs the architecture specs and web guards"
has "$PRE_PUSH" 'pnpm check:ops' "pre-push runs check:ops"
has "$PRE_PUSH" 'tools/verify/push-touches-ops.sh' "pre-push runs check:ops only when the push touches what it checks"
has "$PRE_PUSH" 'pnpm guards' "pre-push runs the repository guards"
has "$PRE_PUSH" 'pnpm test:guards' "pre-push runs the guards' own tests"
has "$PRE_COMMIT" 'pnpm guards' "pre-commit runs the repository guards"

[ "$fails" -eq 0 ] || exit 1
