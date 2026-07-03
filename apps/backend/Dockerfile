# Dependencies stage - separate for better caching
# Use slim (Debian/glibc) instead of alpine (musl) because @livekit/rtc-node
# only ships gnu/glibc binaries — no musl variant available.
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /workspace

# Cache-busting argument to force fresh build when needed
ARG CACHEBUST=1

# Copy only package files (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/appshore/db/package.json ./packages/appshore/db/
COPY packages/appshore/kernel/package.json ./packages/appshore/kernel/
COPY packages/appshore/platform/package.json ./packages/appshore/platform/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Builder stage
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /workspace

# Accept DATABASE_URL as build argument (optional, uses placeholder if not provided)
ARG DATABASE_URL

# Copy everything from deps stage (preserves symlink structure)
COPY --from=deps /workspace ./

# Copy source code (overwrites package.json-only dirs with full source)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY turbo.json* ./
COPY packages ./packages
COPY apps/backend ./apps/backend

# Build shared-types package first
WORKDIR /workspace/packages/shared-types
RUN pnpm run build

# Generate Prisma client + build the foundation packages (kernel ← db ← platform)
WORKDIR /workspace/packages/appshore/db
RUN pnpm exec prisma generate
RUN pnpm exec tsc -p tsconfig.build.json
WORKDIR /workspace/packages/appshore/kernel
RUN pnpm run build
WORKDIR /workspace/packages/appshore/platform
RUN pnpm run build

# Build backend
WORKDIR /workspace/apps/backend
RUN pnpm run build

# Use pnpm deploy to create a self-contained production bundle (no symlinks)
WORKDIR /workspace
RUN pnpm --filter @app/backend deploy /production --prod

# The generated Prisma client ships inside @appshore/db (generated/client),
# which pnpm deploy bundles into /production/node_modules/@appshore/db.

# Copy shared-types built output into production node_modules
RUN rm -rf /production/node_modules/@app/shared-types && \
    mkdir -p /production/node_modules/@app/shared-types && \
    cp -r /workspace/packages/shared-types/dist /production/node_modules/@app/shared-types/dist && \
    cp /workspace/packages/shared-types/package.json /production/node_modules/@app/shared-types/package.json

# Production stage - minimal image
FROM node:20-slim AS production
WORKDIR /app

# Install wget for healthcheck + native libs for @livekit/rtc-node WebRTC binary + Doppler CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    libstdc++6 \
    libgcc-s1 \
    ca-certificates \
    curl \
    gnupg \
    && curl -sLf --retry 3 --tlsv1.2 --proto "=https" "https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key" | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" > /etc/apt/sources.list.d/doppler-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends doppler \
    && apt-get purge -y curl gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy the self-contained production bundle
COPY --from=builder /production/node_modules ./node_modules
COPY --from=builder /workspace/apps/backend/dist ./dist
COPY --from=builder /workspace/apps/backend/content ./content
COPY --from=builder /workspace/packages/appshore/db/prisma ./prisma
COPY --from=builder /workspace/packages/appshore/db/prisma.config.ts ./prisma.config.ts
COPY --from=builder /workspace/apps/backend/package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8000/api/v1/health/live || exit 1

EXPOSE 8000

# Start application via Doppler (DOPPLER_TOKEN env var required in ECS task definition)
# Doppler injects all env vars (secrets + config) at container startup
CMD ["doppler", "run", "--", "node", "dist/main"]
