# ─────────────────────────────────────────────────────────────
# Development stage
#
# Used with the `apps` profile in docker-compose.yml. The compose
# file mounts the entire repo at /workspace (so @app/ui and
# @app/shared-types workspace symlinks resolve) and shadows
# node_modules with anonymous volumes so host/container installs
# don't collide.
#
# This stage intentionally runs `pnpm install` at build time so
# the anonymous node_modules volumes are seeded the first time
# the container starts.
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS development
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /workspace

# Copy workspace manifests first for better layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY turbo.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/console/package.json ./apps/console/
COPY apps/backend/package.json ./apps/backend/
COPY packages ./packages

# Install full workspace so @app/ui and @app/shared-types are linked.
RUN pnpm install --frozen-lockfile

# Source for apps/web is mounted at runtime via docker-compose volumes.
WORKDIR /workspace/apps/web

EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# ─────────────────────────────────────────────────────────────
# Build stage (for production image)
#
# NOTE: the primary production deploy path for web is Vercel —
# this image is used for compose/smoke-testing and self-hosting.
# Next.js inlines NEXT_PUBLIC_* values at BUILD time, so a
# functional image requires passing them as --build-arg (otherwise
# the client bundle bakes in the localhost fallbacks).
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate

# Client-side (build-time) configuration — see apps/web/.env.example
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MULTI_TENANT
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_DOMAIN
ARG NEXT_PUBLIC_CONSOLE_URL
ARG NEXT_PUBLIC_CDN_URL
ARG NEXT_PUBLIC_S3_BUCKET_HOST
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_LANGFUSE_BASE_URL
ARG NEXT_PUBLIC_LANGFUSE_PROJECT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MULTI_TENANT=$NEXT_PUBLIC_MULTI_TENANT \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN \
    NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL \
    NEXT_PUBLIC_CDN_URL=$NEXT_PUBLIC_CDN_URL \
    NEXT_PUBLIC_S3_BUCKET_HOST=$NEXT_PUBLIC_S3_BUCKET_HOST \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_LANGFUSE_BASE_URL=$NEXT_PUBLIC_LANGFUSE_BASE_URL \
    NEXT_PUBLIC_LANGFUSE_PROJECT_ID=$NEXT_PUBLIC_LANGFUSE_PROJECT_ID

WORKDIR /workspace

# Copy root workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY turbo.json* ./

# Copy workspace packages (needed for @app/ui, @app/shared-types)
COPY packages ./packages
COPY apps/web/package.json ./apps/web/

# Install all workspace dependencies from root
RUN pnpm install --frozen-lockfile

# Copy workspace apps/web source
COPY apps/web ./apps/web

# Build shared-types first (web depends on it)
RUN pnpm --filter @app/shared-types build

# Build web
WORKDIR /workspace/apps/web
RUN pnpm run build

# ─────────────────────────────────────────────────────────────
# Production stage
# ─────────────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

ENV NODE_ENV=production

# Next standalone output
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "apps/web/server.js"]
