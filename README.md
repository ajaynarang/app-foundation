# app-foundation

A **domain-free, full-stack platform starter**. Clone it, drop in your business domain, and you
start with authentication, multi-tenancy, billing, a working AI assistant, background jobs,
observability, and cloud infrastructure already built and wired together.

It runs **multi-tenant** (the default) or **single-tenant** from the _same codebase_ — flip one
environment variable.

> This is a template. Use GitHub's **"Use this template"** button (or fork) to start a new app.

## Make it yours

```bash
pnpm install
pnpm init-app --name my-app --display-name "My App" --yes
```

One command renames everything — packages, docker containers, Terraform project, Doppler
projects, branding, tenancy defaults. Run it with no flags for interactive prompts, or with
`--dry-run` to preview. Details: [tools/init-app/README.md](./tools/init-app/README.md).

---

## What you get for free

| Capability           | Included                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**             | JWT + refresh tokens, Firebase exchange, phone PIN/OTP, login-event tracking, OAuth provider                                                                                      |
| **Multi-tenancy**    | Tenant-scoped data, global guard chain, subdomain resolution — toggle to single-tenant with one env var                                                                           |
| **AI**               | Streaming chat assistant (Mastra + AI SDK + Anthropic), Langfuse tracing, moderation, per-tenant AI budgets, human-in-the-loop, and an **empty MCP toolset** ready for your tools |
| **Billing**          | Stripe subscriptions, wallet, plan entitlements, add-ons                                                                                                                          |
| **Jobs & workflows** | BullMQ queues, Inngest "Desk" durable workflow engine (empty registry)                                                                                                            |
| **Realtime**         | Server-Sent Events bus with per-tenant/user routing                                                                                                                               |
| **Storage & comms**  | S3 file storage, email, SMS, web push                                                                                                                                             |
| **Observability**    | OpenTelemetry, pino logging, Loki + Tempo + Grafana                                                                                                                               |
| **Infra**            | Docker Compose (dev), Terraform for AWS (ECS, RDS, ElastiCache, S3, ALB, CloudWatch)                                                                                              |
| **DX**               | Turborepo, pnpm workspaces, shared Zod types with Prisma-enum codegen, architecture fitness tests, CI workflows                                                                   |

There is **no business domain** — that's the point. You add yours.

---

## Quick start

```bash
# 1. Infra (Postgres+pgvector on :5499, Redis on :6399)
docker compose up -d postgres redis

# 2. Install + build shared types
pnpm install
pnpm --filter @app/shared-types build

# 3. Configure env files
cp apps/backend/.env.example apps/backend/.env
#    set DATABASE_URL=postgresql://postgres:postgres@localhost:5499/app?schema=public
#    set ANTHROPIC_API_KEY=... (for the AI assistant)
cp apps/web/.env.example apps/web/.env.local

# 4. Generate Prisma client, migrate + seed
cd apps/backend && pnpm prisma:generate && pnpm prisma:migrate:deploy && pnpm db:seed

# 5. Run everything (backend :8000, web :3000, console :3002)
cd ../.. && pnpm dev
```

> Prefer secrets injection over `.env` files? See [docs/doppler.md](./docs/doppler.md) for the full Doppler environment-variable guide.

---

## Multi-tenant vs single-tenant

The same code runs either way — choose at boot:

|                   | Multi-tenant (default)          | Single-tenant                                 |
| ----------------- | ------------------------------- | --------------------------------------------- |
| Backend env       | `MULTI_TENANT=true`             | `MULTI_TENANT=false` + `IMPLICIT_TENANT_ID=1` |
| Web env           | `NEXT_PUBLIC_MULTI_TENANT=true` | `NEXT_PUBLIC_MULTI_TENANT=false`              |
| Tenant resolution | from subdomain                  | one implicit tenant, no subdomain             |
| Login             | tenant-scoped                   | plain origin                                  |
| Self-registration | enabled                         | hidden                                        |

Tenant data isolation works identically in both modes (every query is tenant-scoped; single-tenant
just resolves to the one implicit tenant). No query rewrites — only guard/strategy short-circuits.

---

## Where you plug in your domain

| To add…                  | Do this                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| A backend domain         | New module under `apps/backend/src/domains/<domain>/` + models in `prisma/schema.prisma` |
| A frontend feature       | New folder under `apps/web/src/features/<domain>/`                                       |
| AI tools                 | Register `@Tool` providers in `apps/backend/src/domains/ai/mcp/mcp-tools.module.ts`      |
| Workflow automation      | Add to the registry in `apps/backend/src/domains/desk/responsibilities/`                 |
| An integration connector | Add to `VENDOR_REGISTRY` in `apps/backend/src/domains/integrations/`                     |
| AI knowledge             | Drop Markdown in `apps/backend/content/knowledge-base/`, run `pnpm seed:knowledge`       |

---

## Structure

```
apps/{backend,web,console}   packages/{ui,shared-types,test-utils}
infra/{terraform,observability}   tests/   docker-compose.yml
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions and the full domain map, and
[`docs/superpowers/specs/`](./docs/superpowers/specs/) for the design spec and the platform/domain
seam report this starter was built from.

---

## License

MIT
