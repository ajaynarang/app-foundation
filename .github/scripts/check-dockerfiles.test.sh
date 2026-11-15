#!/usr/bin/env bash
# Hermetic test of check-dockerfiles.sh on throwaway repo roots, then on this repo. Run by `pnpm check:ops`.
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/check-dockerfiles.sh"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0

expect() { # <want: pass|fail> <name> <root>
  local want=$1 name=$2 got=fail
  if bash "$SCRIPT" "$3" >/dev/null 2>&1; then got=pass; fi
  if [ "$got" = "$want" ]; then echo "ok   $name"; else
    echo "FAIL $name (wanted $want, got $got)"
    fails=$((fails + 1))
  fi
}

# fixture <name> <backend Dockerfile body> [web Dockerfile body] [package.json body]
fixture() {
  local dir="$work/$1"
  mkdir -p "$dir/apps/backend" "$dir/apps/web"
  printf '%s\n' "$2" >"$dir/apps/backend/Dockerfile"
  printf '%s\n' "${3:-$GOOD_WEB}" >"$dir/apps/web/Dockerfile"
  printf '%s\n' "${4:-$PATCHED_PKG}" >"$dir/package.json"
  echo "$dir"
}

PATCHED_PKG='{ "pnpm": { "patchedDependencies": { "x@1.0.0": "patches/x@1.0.0.patch" } } }'
PLAIN_PKG='{ "name": "plain" }'

GOOD_BACKEND='FROM node:20-slim AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM node:20-slim AS production
WORKDIR /app
RUN chown node:node /app
COPY --chown=node:node --from=deps /workspace/node_modules ./node_modules
COPY --chown=node:node --from=deps /workspace/dist ./dist
USER node
CMD ["node", "dist/main"]'

GOOD_WEB='FROM node:20-slim AS builder
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM node:20-slim AS production
COPY --from=builder /workspace/out ./
CMD ["node", "server.js"]'

expect pass "a non-root USER, chowned copies and patches before install" "$(fixture good "$GOOD_BACKEND")"

expect fail "no USER line (runs as root)" "$(fixture no-user "${GOOD_BACKEND//USER node/}")"

expect fail "last USER is root" "$(fixture root-user "${GOOD_BACKEND//USER node/USER node
USER root}")"

expect fail "last USER is uid 0" "$(fixture uid-zero "${GOOD_BACKEND//USER node/USER 0:0}")"

expect fail "a final-stage COPY without --chown" "$(fixture no-chown "${GOOD_BACKEND//COPY --chown=node:node --from=deps \/workspace\/dist/COPY --from=deps /workspace/dist}")"

expect fail "chown -R in the final stage" "$(fixture chown-r "${GOOD_BACKEND//RUN chown node:node \/app/RUN chown -R node:node /app}")"

expect fail "backend install without COPY patches/" "$(fixture backend-no-patches "${GOOD_BACKEND//COPY patches .\/patches/}")"

expect fail "web install without COPY patches/" "$(fixture web-no-patches "$GOOD_BACKEND" "${GOOD_WEB//COPY patches .\/patches/}")"

expect fail "patches copied in another stage only" "$(fixture patches-wrong-stage "FROM node:20-slim AS a
COPY patches ./patches
FROM node:20-slim AS b
RUN pnpm install --frozen-lockfile
FROM node:20-slim AS production
COPY --chown=node:node --from=b /x ./x
USER node")"

expect fail "patches copied after the install" "$(fixture patches-after "${GOOD_BACKEND//COPY patches .\/patches
RUN pnpm install --frozen-lockfile/RUN pnpm install --frozen-lockfile
COPY patches ./patches}")"

expect pass "no patchedDependencies: patches/ not required" "$(fixture unpatched "${GOOD_BACKEND//COPY patches .\/patches/}" "${GOOD_WEB//COPY patches .\/patches/}" "$PLAIN_PKG")"

expect pass "this repo's Dockerfiles" "$REPO"

if [ "$fails" -ne 0 ]; then
  echo "check-dockerfiles.test: $fails failed"
  exit 1
fi
echo "check-dockerfiles.test: all passed"
