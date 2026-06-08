#!/bin/bash

# SALLY Installation Script
# This script automates the initial setup of the SALLY project

set -e  # Exit on error

echo "========================================="
echo "  SALLY Installation Script"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the project root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing root dependencies (Turborepo)${NC}"
pnpm install
echo -e "${GREEN}✓ Root dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 2: Installing backend dependencies${NC}"
cd apps/backend
if ! command -v uv &> /dev/null; then
    echo -e "${RED}Error: UV is not installed. Please install it first:${NC}"
    echo "curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
uv sync
echo -e "${GREEN}✓ Backend dependencies installed${NC}"
cd ../..
echo ""

echo -e "${YELLOW}Step 3: Frontend dependencies${NC}"
echo -e "${GREEN}✓ Frontend dependencies installed (via pnpm workspace)${NC}"
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

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Start services with Docker:"
echo "   ${YELLOW}docker-compose up -d${NC}"
echo ""
echo "2. Initialize database:"
echo "   ${YELLOW}docker-compose exec backend uv run alembic upgrade head${NC}"
echo ""
echo "3. (Optional) Seed database:"
echo "   ${YELLOW}docker-compose exec backend uv run python scripts/db_seed.py${NC}"
echo ""
echo "4. Access the application:"
echo "   Frontend: ${YELLOW}http://localhost:3000${NC}"
echo "   Backend API: ${YELLOW}http://localhost:8000/docs${NC}"
echo ""
echo "For more details, see SETUP.md"
echo ""
