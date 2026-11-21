#!/usr/bin/env bash
#
# Project bootstrap: infra containers, dependencies, builds, database.
# Run from the repo root: ./tools/dev/install.sh
#
# The same script sets up a Mac and a Linux cloud session (Claude Code on the
# web: the environment's setup script calls it, see tools/cloud-env/). Safe to
# run again: every step is idempotent.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f "package.json" ] || [ ! -f "pnpm-workspace.yaml" ]; then
  echo -e "${RED}Error: run this script from the project root directory${NC}"
  exit 1
fi

echo -e "${YELLOW}Step 1: Starting Postgres + Redis (Docker)${NC}"
tools/dev/docker-up.sh postgres redis
until docker compose exec -T postgres pg_isready -q; do sleep 1; done
echo -e "${GREEN}✓ Postgres and Redis running${NC}"
echo ""

echo -e "${YELLOW}Step 2: Installing dependencies (pnpm workspace, lockfile as committed)${NC}"
pnpm install --frozen-lockfile
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 3: Prisma client, then the shared and foundation packages${NC}"
pnpm --filter @appshore/db prisma:generate
pnpm --filter @app/shared-types --filter @appshore/kernel --filter @appshore/db --filter @appshore/platform build
echo -e "${GREEN}✓ Packages built${NC}"
echo ""

echo -e "${YELLOW}Step 4: Setting up environment files (only used when running without Doppler)${NC}"
[ -f apps/backend/.env ] || cp apps/backend/.env.example apps/backend/.env
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local
echo -e "${GREEN}✓ apps/backend/.env and apps/web/.env.local present${NC}"
echo ""

echo -e "${YELLOW}Step 5: Migrating and seeding the database${NC}"
# The address comes from the Postgres container running now, never from an env
# file that may be out of date. An exported DATABASE_URL wins over any .env.
DATABASE_URL="$(tools/dev/local-db-url.sh)"
export DATABASE_URL
pnpm --filter @appshore/db prisma:migrate:deploy
pnpm --filter @appshore/db setup:base
echo -e "${GREEN}✓ Database migrated and seeded${NC}"
echo ""

echo -e "${GREEN}Bootstrap complete.${NC}"
echo ""
echo -e "Next:"
echo -e "  Start the apps:  ${YELLOW}pnpm dev${NC} (or ${YELLOW}pnpm dev:side${NC} on a Mac, with Doppler)"
echo -e "  Web:             ${YELLOW}http://localhost:3000${NC}"
echo -e "  Backend API:     ${YELLOW}http://localhost:8000${NC}"
echo -e "  More detail:     CLAUDE.md (Quick start)"
