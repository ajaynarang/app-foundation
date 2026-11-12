# Doppler — Environment Variables & Secrets

How this starter manages environment variables across local dev, staging, and production
using [Doppler](https://www.doppler.com/).

## Why Doppler here

Secrets never live in git — the committed `.env.example` files are the **contract** (every
variable each app expects, with placeholders), while real values live in Doppler. At runtime,
`doppler run -- <command>` fetches the correct config and injects it into `process.env` before
the process starts — locally, in CI, and inside ECS containers. The backend
(`apps/backend/src/config/configuration.ts`) and both Next.js apps (`next.config.ts`) log the
config source at startup, so you can always tell whether you're running on Doppler or plain
`.env` files:

```
[Config] Source: Doppler (app-backend/dev) | development | 12 vars loaded
```

Doppler is **optional for local dev** — see [Fallback without Doppler](#fallback-without-doppler).

## One-time setup

### 1. Install the CLI and log in

```bash
brew install gnupg dopplerhq/cli/doppler   # macOS
doppler login                              # opens a browser, once per machine
```

### 2. Create the projects

The repo's scripts and `doppler.yaml` files assume these exact project names:

| Doppler project | App            | Declared in                 |
| --------------- | -------------- | --------------------------- |
| `app-backend`   | `apps/backend` | `apps/backend/doppler.yaml` |
| `app-frontend`  | `apps/web`     | `apps/web/doppler.yaml`     |

```bash
doppler projects create app-backend
doppler projects create app-frontend
```

New Doppler projects come with the three root configs this repo expects: `dev`, `stg`, `prd`.

### 3. Link each app directory

Each app ships a `doppler.yaml` pinning its project and default config (`dev`). Run
`doppler setup` once per app directory to accept it — this is what makes a bare `doppler run`
work from that cwd with no flags:

```bash
cd apps/backend  && doppler setup    # → app-backend / dev
cd ../web        && doppler setup    # → app-frontend / dev
```

### 4. Run the apps through Doppler

From the repo root:

```bash
pnpm doppler:backend     # cd apps/backend && doppler run -- pnpm run dev
pnpm doppler:frontend    # cd apps/web     && doppler run -- pnpm run dev
```

The QA suite scripts pin project/config explicitly instead of relying on cwd:

```bash
pnpm test:qa:local       # doppler run --project app-backend --config dev -- pnpm --filter @app/qa test
```

> The QA scripts read `API_BASE_URL`, `WEB_BASE_URL`, and `DEV_AUTH_SECRET` from
> `app-backend/dev` — add those three to that config if you use `test:*:local`
> or `qa:*`.

## Seeding from .env.example

Bulk-import each app's `.env.example` into its `dev` config, then replace placeholders with
real values:

```bash
doppler secrets upload apps/backend/.env.example --project app-backend  --config dev
doppler secrets upload apps/web/.env.example     --project app-frontend --config dev
```

Notes:

- `doppler secrets upload` only imports **uncommented** `KEY=value` lines. Secrets in
  `.env.example` are intentionally commented out — set those individually afterwards
  (see the [reference tables](#variable-reference) for where to get each value).
- Repeat per config (`--config stg`, `--config prd`) with environment-appropriate values.

## Updating a variable

```bash
# Set (creates or updates)
doppler secrets set OPENROUTER_API_KEY=sk-or-v1-... --project app-backend --config dev

# Read one value
doppler secrets get OPENROUTER_API_KEY --project app-backend --config dev --plain

# Inspect a whole config without writing a file
doppler secrets download --no-file --format env --project app-backend --config dev

# Delete
doppler secrets delete OLD_VAR --project app-backend --config dev
```

Inside a linked app directory you can drop the `--project/--config` flags.

Doppler injects at **process start** — a running `doppler run` process does not pick up
changes. Restart the dev server (or redeploy the ECS service) after changing a value.

When you add a brand-new variable, update all three places:

1. `apps/<app>/.env.example` — placeholder + comment (the contract)
2. Doppler — real values in `dev`, `stg`, `prd`
3. `apps/backend/src/config/configuration.ts` — Zod schema entry, if it's a validated backend var

## Variable reference

"Required to boot?" reflects the backend's Zod validation
(`apps/backend/src/config/configuration.ts`) and code fallbacks — the template is designed to
boot with **minimal** config (Postgres + Redis). Firebase, the AI routes, Stripe, Twilio, voice
and Desk workflow keys are all optional at boot; the related feature simply stays disabled
until configured.

### Backend (`app-backend`)

Minimum to boot locally: `DATABASE_URL` + `REDIS_URL` (everything else has a default or is
feature-gated). The dev-grade defaults for the signing and encryption secrets are public.
In production (`NODE_ENV=production`, which the backend image sets, or `ENV_TYPE=production`) the backend refuses to boot unless `SECRET_KEY`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `OAUTH_JWT_SECRET`, `OAUTH_CONSENT_SECRET` and `CREDENTIALS_ENCRYPTION_KEY` are
set to real values (not a default, not a placeholder from `.env.example`), `OAUTH_ISSUER` is the
public https URL of the API, `CORS_ORIGINS` lists no local origin, `INNGEST_DEV` is off and
`WEBHOOK_ALLOW_PRIVATE_TARGETS` is not `true`. The checks live in `apps/backend/src/config/configuration.ts`.

| Variable                            | Required to boot?                                                                                    | Secret? | Purpose                                                                                                                                                   | Where to get it                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                          | No (the backend image sets `production`; default `development` elsewhere)                            | No      | Runtime mode. `production` turns on the boot checks above                                                                                                 | —                                                                                                            |
| `ENV_TYPE`                          | **Yes** (the backend refuses to boot without it)                                                     | No      | Deployment label: `development`, `sandbox`, `preprod` or `production`. `production` turns on the boot checks above even if `NODE_ENV` is not `production` | —                                                                                                            |
| `LOG_LEVEL`                         | No                                                                                                   | No      | Pino log level                                                                                                                                            | —                                                                                                            |
| `PORT`                              | No (default `8000`)                                                                                  | No      | API listen port                                                                                                                                           | —                                                                                                            |
| `MULTI_TENANT`                      | No (default `true`)                                                                                  | No      | Multi-tenant vs single-tenant toggle                                                                                                                      | —                                                                                                            |
| `IMPLICIT_TENANT_ID`                | No (default `1`)                                                                                     | No      | Tenant used when `MULTI_TENANT=false`                                                                                                                     | —                                                                                                            |
| `DEFAULT_ADMIN_EMAIL`               | No                                                                                                   | No      | Seeded admin user email                                                                                                                                   | —                                                                                                            |
| `OTEL_SERVICE_NAME`                 | No                                                                                                   | No      | OpenTelemetry service name                                                                                                                                | —                                                                                                            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`       | No                                                                                                   | No      | OTLP traces endpoint (local Tempo via the observability compose profile)                                                                                  | —                                                                                                            |
| `LOG_TRANSPORT`                     | No                                                                                                   | No      | Set `loki` to ship logs to Loki                                                                                                                           | —                                                                                                            |
| `LOKI_URL`                          | No                                                                                                   | No      | Loki endpoint when `LOG_TRANSPORT=loki`                                                                                                                   | —                                                                                                            |
| `DATABASE_URL`                      | **Yes**                                                                                              | Yes     | Postgres connection string (compose dev DB is on `:5499`)                                                                                                 | Local: docker compose. Deployed: RDS endpoint from Terraform output                                          |
| `REDIS_URL`                         | **Yes** (validation fails without it)                                                                | Yes     | Redis connection (cache, BullMQ, SSE)                                                                                                                     | Local: docker compose (`:6399`). Deployed: ElastiCache endpoint                                              |
| `CORS_ORIGINS`                      | No in dev (default `http://localhost:3000`); **Yes when `NODE_ENV=production`**, and no local origin | No      | Allowed browser origins, comma-separated                                                                                                                  | —                                                                                                            |
| `API_V1_PREFIX`                     | No (default `/api/v1`)                                                                               | No      | API route prefix                                                                                                                                          | —                                                                                                            |
| `SWAGGER_UI_ENABLED`                | No (on outside production, off when `NODE_ENV=production`)                                           | No      | Interactive Swagger UI at `/api`. Set `true` to serve it in production deliberately                                                                       | —                                                                                                            |
| `PROJECT_NAME`                      | No                                                                                                   | No      | Display name (Swagger, emails)                                                                                                                            | —                                                                                                            |
| `APP_URL`                           | No                                                                                                   | No      | Public web app URL (links in emails/invites)                                                                                                              | —                                                                                                            |
| `COOKIE_DOMAIN`                     | No (leave unset)                                                                                     | No      | Legacy. The refresh cookie is host-only; if set, used only to expire cookies an earlier version issued with this `Domain`                                 | —                                                                                                            |
| `JWT_ACCESS_EXPIRY`                 | No (default `15m`)                                                                                   | No      | Access-token TTL                                                                                                                                          | —                                                                                                            |
| `JWT_REFRESH_EXPIRY`                | No (default `7d`)                                                                                    | No      | Refresh-token TTL                                                                                                                                         | —                                                                                                            |
| `SECRET_KEY`                        | No in dev (public dev default); **Yes when `NODE_ENV=production`**                                   | Yes     | General app signing key (32+ chars)                                                                                                                       | Generate: `openssl rand -hex 32`                                                                             |
| `JWT_ACCESS_SECRET`                 | No in dev (public dev default); **Yes when `NODE_ENV=production`**                                   | Yes     | Access-token signing key                                                                                                                                  | Generate: `openssl rand -hex 32`                                                                             |
| `JWT_REFRESH_SECRET`                | No in dev (public dev default); **Yes when `NODE_ENV=production`**                                   | Yes     | Refresh-token signing key                                                                                                                                 | Generate: `openssl rand -hex 32`                                                                             |
| `BCRYPT_ROUNDS`                     | No (default `10`)                                                                                    | No      | Password hash cost                                                                                                                                        | —                                                                                                            |
| `DEV_AUTH_SECRET`                   | No (dev/stg only; leave unset in prd — route 404s)                                                   | Yes     | Gates `/api/v1/dev/*` test-auth endpoints (also used by QA + web dev-switcher)                                                                            | Generate: `openssl rand -hex 16`                                                                             |
| `CREDENTIALS_ENCRYPTION_KEY`        | No in dev (public dev default); **Yes when `NODE_ENV=production`**                                   | Yes     | AES-256 key (64 hex characters) for encrypting third-party credentials at rest. Changing it makes stored credentials unreadable                           | Generate: `openssl rand -hex 32`                                                                             |
| `FIREBASE_PROJECT_ID`               | No (Firebase auth disabled without it)                                                               | No      | Firebase Admin SDK project                                                                                                                                | Firebase console → Project settings                                                                          |
| `FIREBASE_CLIENT_EMAIL`             | No                                                                                                   | No      | Firebase service-account email                                                                                                                            | Firebase console → Project settings → Service accounts                                                       |
| `FIREBASE_PRIVATE_KEY`              | No                                                                                                   | Yes     | Firebase service-account key (keep `\n` escapes, quote the value)                                                                                         | Firebase console → Service accounts → Generate new private key                                               |
| `TENANT_BASE_URL`                   | No                                                                                                   | No      | Base domain for tenant subdomains (multi-tenant)                                                                                                          | —                                                                                                            |
| `USE_TENANT_SUBDOMAINS`             | No (default `false`)                                                                                 | No      | Enable subdomain-per-tenant URLs                                                                                                                          | —                                                                                                            |
| `EMAIL_FROM`                        | No                                                                                                   | No      | From address for outbound email                                                                                                                           | —                                                                                                            |
| `RESEND_API_KEY`                    | No (email logs to console without it)                                                                | Yes     | Transactional email provider                                                                                                                              | Resend dashboard → API Keys                                                                                  |
| `RESEND_INBOUND_WEBHOOK_SECRET`     | No                                                                                                   | Yes     | Verifies inbound-email webhooks                                                                                                                           | Resend dashboard → Webhooks                                                                                  |
| `S3_BUCKET`                         | No (default `app-documents`)                                                                         | No      | File-storage bucket                                                                                                                                       | Terraform output / AWS S3 console                                                                            |
| `S3_REGION`                         | No (default `us-east-1`)                                                                             | No      | Bucket region                                                                                                                                             | —                                                                                                            |
| `AWS_ACCESS_KEY_ID`                 | No (uploads fail without; ECS uses task role instead)                                                | Yes     | S3 credentials for local dev                                                                                                                              | AWS IAM → user with S3 access                                                                                |
| `AWS_SECRET_ACCESS_KEY`             | No                                                                                                   | Yes     | S3 credentials for local dev                                                                                                                              | AWS IAM                                                                                                      |
| `ANTHROPIC_API_KEY`                 | No (not a platform route; nothing in the app reads it)                                               | Yes     | Dev and test key only: `ai:live-check` reads it; a workspace connects it in Settings as its own credential                                                | Anthropic console (console.anthropic.com) → API Keys                                                         |
| `OPENAI_API_KEY`                    | No (content moderation disabled without it)                                                          | Yes     | Moderation API                                                                                                                                            | platform.openai.com → API Keys                                                                               |
| `OPENROUTER_API_KEY`                | No (the platform language route is off without it)                                                   | Yes     | Platform default language route (`platform-openrouter`): chat, structured output, classifier, feedback                                                    | openrouter.ai → Keys                                                                                         |
| `COHERE_API_KEY`                    | No (the platform embedding route is off without it)                                                  | Yes     | Platform embedding route (`platform-cohere`, Embed v4 at 1536 dimensions)                                                                                 | dashboard.cohere.com → API Keys                                                                              |
| `AI_CREDENTIALS_KEY`                | No (bring-your-own-key is off without it)                                                            | Yes     | Encrypts workspace AI keys and turns bring-your-own-key on; exactly 64 hex characters or boot fails                                                       | `openssl rand -hex 32`                                                                                       |
| `PLATFORM_BEDROCK_REGION`           | No (the zero-retention platform route is off without it)                                             | No      | Enables `platform-bedrock` in this AWS region (task role credentials): serves zero-retention workspaces. Run `ai:ab-gate` first                           | An AWS region the catalog's `us.` Bedrock profiles serve, e.g. `us-east-1`                                   |
| `PLATFORM_ASSUME_ROLE_ARN`          | No (workspaces cannot connect an AWS role without it); comma-separated IAM ARNs                      | No      | The role(s) the backend runs as: what a workspace's Bedrock trust policy must name. Set by Terraform; never in Doppler (it would override)                | Terraform (`bedrock_tenant_roles_enabled = true`); on a dev machine, your own principal's ARN                |
| `PLATFORM_BEDROCK_CFN_TEMPLATE_URL` | No                                                                                                   | No      | Optional CloudFormation quick-create link shown in the Bedrock connect sheet                                                                              | Your own hosted template                                                                                     |
| `AI_PROMPT_CACHE_OVERRIDE`          | No (local only; ignored on every deployed task)                                                      | No      | `none` turns prompt caching off on every route, to measure the uncached baseline                                                                          | —                                                                                                            |
| `AI_USAGE_CAPTURE_DIR`              | No (local only; ignored on every deployed task)                                                      | No      | Folder where each AI call's usage shape is written (numbers only), to capture `usageFromAiSdk` fixtures                                                   | —                                                                                                            |
| `LANGFUSE_SECRET_KEY`               | No (tracing disabled without it)                                                                     | Yes     | LLM observability                                                                                                                                         | Langfuse → Project settings → API Keys                                                                       |
| `LANGFUSE_PUBLIC_KEY`               | No                                                                                                   | No      | Langfuse public key                                                                                                                                       | Langfuse → Project settings → API Keys                                                                       |
| `LANGFUSE_BASE_URL`                 | No                                                                                                   | No      | Langfuse host                                                                                                                                             | —                                                                                                            |
| `PROMPT_LABEL`                      | No (default `production`)                                                                            | No      | Which Langfuse prompt label to load                                                                                                                       | —                                                                                                            |
| `TWILIO_MOCK_OTP`                   | No (dev only)                                                                                        | No      | Any OTP matching this value passes in dev                                                                                                                 | —                                                                                                            |
| `TWILIO_ACCOUNT_SID`                | No (real SMS/OTP disabled without it)                                                                | Yes     | Twilio account                                                                                                                                            | Twilio console                                                                                               |
| `TWILIO_AUTH_TOKEN`                 | No                                                                                                   | Yes     | Twilio auth                                                                                                                                               | Twilio console                                                                                               |
| `TWILIO_VERIFY_SERVICE_SID`         | No                                                                                                   | Yes     | Twilio Verify service for phone OTP                                                                                                                       | Twilio console → Verify                                                                                      |
| `QUICKBOOKS_SANDBOX`                | No (default `true`)                                                                                  | No      | Sample integration: sandbox vs production API                                                                                                             | —                                                                                                            |
| `QUICKBOOKS_OAUTH_CLIENT_ID`        | No                                                                                                   | Yes     | Sample integration OAuth app                                                                                                                              | Intuit developer portal                                                                                      |
| `QUICKBOOKS_OAUTH_CLIENT_SECRET`    | No                                                                                                   | Yes     | Sample integration OAuth app                                                                                                                              | Intuit developer portal                                                                                      |
| `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | No                                                                                                   | Yes     | Verifies QuickBooks webhooks                                                                                                                              | Intuit developer portal                                                                                      |
| `OAUTH_REDIRECT_URI`                | No                                                                                                   | No      | Shared OAuth callback URL for integration vendors                                                                                                         | —                                                                                                            |
| `OAUTH_ISSUER`                      | No in dev (default `http://localhost:8000`); **Yes when `NODE_ENV=production`**, public https URL    | No      | Public URL of the API: `iss` of every OAuth 2.1 access token and the MCP-server auth metadata                                                             | Your API origin, e.g. `https://api.acme.io`                                                                  |
| `OAUTH_JWT_SECRET`                  | No in dev (derived from `SECRET_KEY`); **Yes when `NODE_ENV=production`**                            | Yes     | Signs OAuth 2.1 access tokens (32+ chars)                                                                                                                 | Generate: `openssl rand -hex 32`. To keep tokens issued earlier valid, use `SECRET_KEY` followed by `-oauth` |
| `OAUTH_CONSENT_SECRET`              | No in dev (derived from `SECRET_KEY`); **Yes when `NODE_ENV=production`**                            | Yes     | Signs OAuth consent challenges (32+ chars); must differ from `OAUTH_JWT_SECRET`                                                                           | Generate: `openssl rand -hex 32`                                                                             |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS`     | No (default off); must not be `true` when `NODE_ENV=production`                                      | No      | Dev only: outbound webhooks may use http and reach localhost or private addresses                                                                         | —                                                                                                            |
| `THROTTLE_LIMIT`                    | No (default `100`)                                                                                   | No      | Global rate limit: requests per window per signed-in user or client IP, per route                                                                         | —                                                                                                            |
| `THROTTLE_TTL_MS`                   | No (default `60000`)                                                                                 | No      | Length of the rate-limit window in milliseconds                                                                                                           | —                                                                                                            |
| `TRUST_PROXY`                       | No (default: `1` in production, none elsewhere)                                                      | No      | Proxy hops in front of the API whose `X-Forwarded-For` entry is trusted (`2` behind a CDN)                                                                | —                                                                                                            |
| `BULL_BOARD_AUTH`                   | No (`false` in dev; keep `true` in stg/prd)                                                          | No      | Auth on the `/admin/queues` UI                                                                                                                            | —                                                                                                            |
| `VAPID_PUBLIC_KEY`                  | No (web push disabled without it)                                                                    | No      | Web-push key pair                                                                                                                                         | Generate: `npx web-push generate-vapid-keys`                                                                 |
| `VAPID_PRIVATE_KEY`                 | No                                                                                                   | Yes     | Web-push key pair                                                                                                                                         | Same command                                                                                                 |
| `VAPID_SUBJECT`                     | No                                                                                                   | No      | `mailto:` contact for push                                                                                                                                | —                                                                                                            |
| `STRIPE_SECRET_KEY`                 | No (billing disabled without it)                                                                     | Yes     | Stripe API                                                                                                                                                | Stripe dashboard → Developers → API keys                                                                     |
| `STRIPE_PUBLISHABLE_KEY`            | No                                                                                                   | No      | Stripe publishable key                                                                                                                                    | Stripe dashboard                                                                                             |
| `STRIPE_WEBHOOK_SECRET`             | No                                                                                                   | Yes     | Verifies Stripe webhooks                                                                                                                                  | Stripe dashboard → Webhooks → Signing secret                                                                 |
| `TURNSTILE_SECRET_KEY`              | No (bot protection skipped without it)                                                               | Yes     | Cloudflare Turnstile server-side check                                                                                                                    | Cloudflare dashboard → Turnstile                                                                             |
| `LIVEKIT_URL`                       | No (voice mode disabled without it)                                                                  | No      | LiveKit project WebSocket URL                                                                                                                             | LiveKit Cloud → Project settings                                                                             |
| `LIVEKIT_API_KEY`                   | No                                                                                                   | Yes     | LiveKit API key                                                                                                                                           | LiveKit Cloud                                                                                                |
| `LIVEKIT_API_SECRET`                | No                                                                                                   | Yes     | LiveKit API secret                                                                                                                                        | LiveKit Cloud                                                                                                |
| `DEEPGRAM_API_KEY`                  | No                                                                                                   | Yes     | Speech-to-text for voice mode                                                                                                                             | Deepgram console                                                                                             |
| `CARTESIA_API_KEY`                  | No                                                                                                   | Yes     | Text-to-speech for voice mode                                                                                                                             | Cartesia dashboard                                                                                           |
| `VOICE_AGENT_SECRET`                | No in dev (public dev default); **Yes in production when `LIVEKIT_URL` is set**                      | Yes     | Auth between API and the voice-agent worker                                                                                                               | Generate: `openssl rand -hex 32`                                                                             |
| `APP_API_URL`                       | No (default `http://localhost:8000`)                                                                 | No      | Public origin the voice-agent worker calls back into                                                                                                      | —                                                                                                            |

AWS Bedrock (the zero-retention routes):

- `PLATFORM_ASSUME_ROLE_ARN` is the API and worker task role today (they share `ecs_task`). When the worker gets a
  role of its own, the value holds both ARNs, and a workspace connected before that must add the worker role to its
  trust policy.
- AWS stores a trusted role by its internal id. Destroying and recreating `ecs_task` breaks every workspace's trust
  policy until the workspace saves it again.
- On a dev machine the AWS credentials are the developer's, not the task role. A workspace Bedrock connect works
  locally only when `PLATFORM_ASSUME_ROLE_ARN` is the developer's own principal and the test role trusts it.
- For zero retention on `platform-bedrock`, also set the AWS account's Bedrock data retention mode to `none` in that
  region (`PUT /data-retention`); the 5.5 models allow it.

<!-- feature:desk:start -->

Desk (the Inngest workflow engine, only when the product kept it):

| Variable               | Required to boot?                                                | Secret? | Purpose                                                | Where to get it   |
| ---------------------- | ---------------------------------------------------------------- | ------- | ------------------------------------------------------ | ----------------- |
| `INNGEST_ENV`          | No (default `dev`)                                               | No      | Inngest environment name                               | —                 |
| `INNGEST_SERVE_ORIGIN` | No                                                               | No      | Origin the Inngest dev server/cloud reaches the API on | —                 |
| `INNGEST_EVENT_KEY`    | No (local CLI dev server needs none)                             | Yes     | Inngest cloud event key                                | Inngest dashboard |
| `INNGEST_SIGNING_KEY`  | No (without it the deployed Inngest endpoint rejects every call) | Yes     | Inngest cloud signing key                              | Inngest dashboard |

<!-- feature:desk:end -->

### Web (`app-frontend`)

The web app boots with zero env vars locally (code falls back to `http://localhost:8000/api/v1` /
`localhost:3000`). In any deployed environment, `NEXT_PUBLIC_API_URL` is effectively required.
`NEXT_PUBLIC_*` values are baked into the browser bundle — never put secrets in them, and
remember a rebuild (not just a restart) is needed for changes to take effect.

| Variable                                   | Required to boot?                                       | Secret? | Purpose                                                              | Where to get it                                           |
| ------------------------------------------ | ------------------------------------------------------- | ------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                      | No locally (localhost fallback); **yes** in stg/prd     | No      | Backend API base URL                                                 | Your backend's public URL                                 |
| `NEXT_PUBLIC_MULTI_TENANT`                 | No (default `true`)                                     | No      | Mirrors backend `MULTI_TENANT`                                       | —                                                         |
| `NODE_ENV`                                 | No                                                      | No      | Runtime mode                                                         | —                                                         |
| `NEXT_PUBLIC_APP_DOMAIN`                   | No locally; needed in multi-tenant stg/prd              | No      | Base domain for tenant-slug extraction + parent-domain cookies       | —                                                         |
| `NEXT_PUBLIC_DEV_SWITCHER`                 | No (dev/stg only)                                       | No      | Floating user/role-switch toolbar (bypasses Firebase/OTP)            | —                                                         |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | No (login page shows an error without the Firebase set) | No      | Firebase web SDK config                                              | Firebase console → Project settings → General → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | No                                                      | No      | Firebase web SDK config                                              | Same place                                                |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | No                                                      | No      | Firebase web SDK config                                              | Same place                                                |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | No                                                      | No      | Firebase web SDK config                                              | Same place                                                |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | No                                                      | No      | Firebase web SDK config                                              | Same place                                                |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | No                                                      | No      | Firebase web SDK config                                              | Same place                                                |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`           | No                                                      | No      | Cloudflare Turnstile widget (pair of backend `TURNSTILE_SECRET_KEY`) | Cloudflare dashboard → Turnstile                          |
| `NEXT_PUBLIC_SENTRY_DSN`                   | No (`captureError()` is a console no-op without it)     | No      | Error tracking                                                       | Sentry → Project settings → Client Keys                   |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`       | No                                                      | No      | Stripe.js on billing pages                                           | Stripe dashboard → API keys                               |
| `NEXT_PUBLIC_LANGFUSE_BASE_URL`            | No                                                      | No      | Langfuse deep-links on the AI Spend page                             | —                                                         |
| `NEXT_PUBLIC_LANGFUSE_PROJECT_ID`          | No (deep-link hidden without it)                        | No      | Langfuse deep-links                                                  | Langfuse project URL                                      |
| `NEXT_PUBLIC_DOCS_URL`                     | No (landing-page button hidden without it)              | No      | "Documentation" link on the landing page                             | Your docs site or repository URL                          |

## Per-environment guidance

Each project has three root configs:

| Config | Used by               | Points at                                   |
| ------ | --------------------- | ------------------------------------------- |
| `dev`  | Local dev, QA scripts | localhost Postgres/Redis, sandbox/test keys |
| `stg`  | Staging ECS + CI      | staging RDS/ElastiCache, sandbox/test keys  |
| `prd`  | Production ECS + CI   | production RDS/ElastiCache, live keys       |

### Service tokens for CI/CD

CI and ECS authenticate with **service tokens** — read-only credentials scoped to a single
project + config:

```bash
doppler configs tokens create ecs-staging    --project app-backend --config stg --plain
doppler configs tokens create ecs-production --project app-backend --config prd --plain
```

Store them as GitHub repository secrets (Settings → Secrets and variables → Actions):

| GitHub Secret       | Doppler source                      |
| ------------------- | ----------------------------------- |
| `DOPPLER_TOKEN_STG` | `app-backend` / `stg` service token |
| `DOPPLER_TOKEN_PRD` | `app-backend` / `prd` service token |

`.github/workflows/deploy-all.yml` uses these in three ways:

1. **Direct reads in CI** — with `DOPPLER_TOKEN` set in a step's env, commands like
   `doppler secrets get DATABASE_URL --plain` need no project/config flags (used to run
   migrations through an SSM tunnel and to seed Langfuse prompts).
2. **Terraform variable** — the token is passed as `-var="doppler_token=..."` to
   `terraform apply`.
3. **ECS injection** — Terraform stores the token in SSM Parameter Store as a SecureString
   (`infra/terraform/doppler.tf`), grants the ECS execution role read access on that one
   parameter (`infra/terraform/iam.tf`), and the task definitions (`infra/terraform/ecs.tf`)
   reference it via the `secrets` block so it never appears in plaintext in the task
   definition. The container command is:

   ```
   doppler run --fallback /tmp/.doppler-fallback.json -- node dist/main
   ```

   so every env var is fetched from Doppler at container startup (the `--fallback` flag keeps
   an encrypted snapshot for resilience against Doppler outages). Adding or changing a backend
   variable in `stg`/`prd` therefore needs **no Terraform or task-definition change** — just a
   service restart/redeploy.

### Frontends (Vercel)

The deploy workflow triggers the web app's Vercel deploy hook; Vercel builds read env
vars from the Vercel project, not from `doppler run`. Either maintain the `NEXT_PUBLIC_*` vars
directly in Vercel, or connect Doppler's **Vercel integration** (Doppler dashboard →
Integrations → Vercel) and map `app-frontend` `stg` → Preview and `prd` →
Production so the configs stay in sync automatically.

## Fallback without Doppler

Plain `.env` files work fine for local dev — Doppler is optional:

```bash
cp apps/backend/.env.example apps/backend/.env        # then fill in values
cp apps/web/.env.example     apps/web/.env.local
pnpm dev                                              # instead of pnpm doppler:*
```

The backend's startup log tells you which source is active (`Doppler (project/config)` vs
`.env files`). Validation, defaults, and behavior are identical either way — everything ends
up in `process.env`.
