#!/bin/bash

# Project bootstrap script
# One-time local setup: infra containers, dependencies, env files, database.
# Run from the repo root: ./tools/dev/install.sh

set -e # Exit on error

echo "========================================="
echo "  Project Bootstrap"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ] || [ ! -f "pnpm-workspace.yaml" ]; then
    echo -e "${RED}Error: Please run this script from the project root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Starting Postgres + Redis (Docker)${NC}"
if ! command -v docker &>/dev/null; then
    echo -e "${RED}Error: Docker is not installed or not on PATH${NC}"
    exit 1
fi
docker compose up -d postgres redis
echo -e "${GREEN}✓ Postgres (localhost:5499) and Redis (localhost:6399) running${NC}"
echo ""

echo -e "${YELLOW}Step 2: Installing dependencies (pnpm workspace)${NC}"
pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 3: Building shared types (@app/shared-types)${NC}"
pnpm --filter @app/shared-types build
echo -e "${GREEN}✓ Shared types built${NC}"
echo ""

echo -e "${YELLOW}Step 4: Setting up environment files${NC}"
if [ ! -f "apps/backend/.env" ]; then
    cp apps/backend/.env.example apps/backend/.env
    echo -e "${GREEN}✓ Created apps/backend/.env${NC}"
else
    echo -e "${YELLOW}⚠ apps/backend/.env already exists, skipping${NC}"
fi

if [ ! -f "apps/web/.env.local" ]; then
    cp apps/web/.env.example apps/web/.env.local
    echo -e "${GREEN}✓ Created apps/web/.env.local${NC}"
else
    echo -e "${YELLOW}⚠ apps/web/.env.local already exists, skipping${NC}"
fi
echo ""

echo -e "${YELLOW}Step 5: Initializing database (Prisma)${NC}"
pnpm --filter @app/backend prisma:generate
pnpm --filter @app/backend prisma:migrate:deploy
pnpm --filter @app/backend db:seed
echo -e "${GREEN}✓ Database migrated and seeded${NC}"
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Bootstrap Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Fill in secrets in ${YELLOW}apps/backend/.env${NC} (ANTHROPIC_API_KEY, ...)"
echo ""
echo "2. Start everything (backend + web + console):"
echo "   ${YELLOW}pnpm dev${NC}"
echo ""
echo "3. Access the application:"
echo "   Web:         ${YELLOW}http://localhost:3000${NC}"
echo "   Console:     ${YELLOW}http://localhost:3002${NC}"
echo "   Backend API: ${YELLOW}http://localhost:8000${NC}"
echo ""
echo "For more details, see CLAUDE.md (Quick start)."
echo ""
