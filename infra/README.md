# the platform Infrastructure

> **New to Terraform?** Start here. This explains what every file does, why it exists, and how they fit together — before you touch anything.

---

## What is Terraform?

Terraform lets you describe AWS infrastructure as code (`.tf` files) instead of clicking around in the AWS console. You write what you want, run `terraform apply`, and it creates/updates/deletes the real AWS resources to match.

The big benefit: everything is version-controlled, repeatable, and reviewable in a PR.

---

## Folder Structure

```
infra/
├── bootstrap/
│   └── main.tf                  ← Run ONCE before anything else
│
└── terraform/
    ├── main.tf                  ← Wires everything together (provider + state backend)
    ├── variables.tf             ← All inputs the configs accept
    ├── outputs.tf               ← Values printed after apply (URLs, ARNs, etc.)
    │
    ├── environments/
    │   ├── staging.tfvars       ← Staging-specific values (small instances, 1 AZ)
    │   └── production.tfvars    ← Production-specific values (larger, 2 AZ)
    │
    ├── vpc.tf                   ← Network: VPC, subnets, NAT, security groups
    ├── ecr.tf                   ← Docker image registry (where your built images live)
    ├── rds.tf                   ← PostgreSQL database
    ├── elasticache.tf           ← Redis cache
    ├── iam.tf                   ← Permissions (who can do what)
    ├── alb.tf                   ← Load balancer + HTTPS + DNS
    ├── cloudwatch.tf            ← Logs
    ├── s3.tf                    ← Document storage bucket (user uploads)
    ├── cdn.tf                   ← S3 + CloudFront for public static assets
    ├── doppler.tf               ← Doppler service token in SSM Parameter Store
    ├── ecs.tf                   ← Where your app actually runs (containers)
    └── scheduler.tf             ← Auto-shutoff for staging at night (saves money)
```

---

## The Two-Step Mental Model

Every Terraform file does one of two things:

1. **Creates an AWS resource** — `resource "aws_something" "name" { ... }`
2. **Reads an existing AWS resource** — `data "aws_something" "name" { ... }`

That's it. Everything else is just configuration inside those blocks.

---

## File-by-File Explanation

### `bootstrap/main.tf` — Run Once, Never Again

This creates the S3 bucket that stores Terraform's memory (called "state"). Terraform needs somewhere to remember what it has already created. Without this, it would try to recreate everything from scratch every time.

**Before you run anything:** the state-bucket name ships as the template token `__PROJECT__-terraform-state`. The token is deliberately an invalid S3 bucket name, so an un-templated `terraform apply` fails fast. Replace it with your project slug first — `pnpm init-app` (see `tools/init-app/`) does this for you, or do it manually:

```bash
# Replace __PROJECT__ with your project slug in all 3 files that use it
# (infra/bootstrap/main.tf, infra/terraform/main.tf, infra/terraform/iam.tf)
grep -rl __PROJECT__ infra | xargs sed -i '' 's/__PROJECT__/myproj/g'
```

Keep the slug equal to `var.project` (in `terraform/variables.tf`) so bucket names and resource prefixes line up.

```
S3 bucket: <project>-terraform-state
  └── staging/terraform.tfstate    ← Terraform's memory for staging
  └── production/terraform.tfstate ← Terraform's memory for production (when ready)
```

You run this **once** with `cd infra/bootstrap && terraform init && terraform apply`. Never again.

**Why separate from the main config?** Because you need the bucket to exist before Terraform can use it as storage. Chicken-and-egg problem — so you create the bucket manually first, then everything else uses it automatically.

**No DynamoDB needed.** Older Terraform setups used a DynamoDB table as a lock (to prevent two people applying at the same time). We use S3 native locking instead (`use_lockfile = true` in `main.tf`) — same protection, no extra AWS service, no extra cost. Requires Terraform 1.10+.

---

### `terraform/main.tf` — The Glue

Three jobs:

1. **Declares the AWS provider** — tells Terraform to use AWS (not Azure/GCP)
2. **Points at the state backend** — "store your memory in that S3 bucket"
3. **Defines the `local.prefix` shortcut** — `app-staging` or `app-production`, used in every resource name so you can tell them apart in the AWS console

You never need to edit this file.

---

### `terraform/variables.tf` — The Knobs

Defines every input the configs accept — but doesn't set values. Think of it as declaring the parameters a function accepts.

```hcl
variable "api_cpu" {
  description = "CPU units for API task"
  type        = number
}
```

The actual values come from `environments/staging.tfvars` or `environments/production.tfvars`. This separation means the same infrastructure code runs in both environments — just with different values plugged in.

---

### `terraform/environments/staging.tfvars` and `production.tfvars` — The Values

These are the only files you regularly edit. They set the actual values for the variables declared above.

**Staging** is intentionally small and cheap:

- 1 Availability Zone (single data center — if it goes down, staging goes down)
- `db.t3.micro` — smallest RDS instance
- 256 CPU / 512 MB memory — minimal Fargate task
- 1 API task, 1 worker task

**Production** is sized for real traffic:

- 2 Availability Zones (if one data center fails, the other keeps running)
- `db.t3.small` — one step up
- 512 CPU / 1024 MB memory
- 2 API tasks (so deploys don't take the app down — one task stays up while the other restarts)

**Before your first apply, you must update these two lines in both files:**

```hcl
domain      = "yourdomain.com"   # REPLACE with your actual domain
github_repo = "myorg/app"      # REPLACE with your GitHub org/repo
```

---

### `terraform/vpc.tf` — The Network

This is the private network your app lives in. Think of it like renting office space — the VPC is the building, subnets are floors, and security groups are the door locks.

```
Internet
    │
    ▼
Internet Gateway          ← Door to the internet
    │
    ▼
Public Subnets            ← ALB (load balancer) lives here — visible to internet
    │
    ▼
NAT Gateway               ← Lets private resources call out (ECR, Anthropic API)
    │                        but internet can't call in
    ▼
Private Subnets           ← ECS tasks, RDS, Redis live here — not visible to internet
```

**Security groups** (the four door locks):

- `alb` — allows port 443 (HTTPS) and 80 (HTTP redirect) from anywhere
- `ecs` — allows port 8000 only from the ALB (not from the internet directly)
- `rds` — allows port 5432 only from ECS tasks
- `elasticache` — allows port 6379 only from ECS tasks

This means your database and Redis are completely unreachable from the internet — only your app containers can talk to them.

---

### `terraform/ecr.tf` — Docker Image Storage

ECR (Elastic Container Registry) is AWS's private Docker Hub. When GitHub Actions builds your Docker image, it pushes it here. When ECS starts a container, it pulls from here.

**One repository, shared across staging and production.** The image tag (git SHA) determines which version each environment runs — not separate repos.

**Staging owns the repository** (creates it). Production just reads it. This means you can deploy staging today without any production setup.

Lifecycle policy: keeps the last 20 images, deletes older ones automatically. Prevents the registry from filling up over months of deploys.

---

### `terraform/rds.tf` — PostgreSQL Database

Creates a managed PostgreSQL 16 database. "Managed" means AWS handles backups, patching, and failover — you just connect to it.

Key settings:

- **`manage_master_user_password = false`** — Password is set via `TF_VAR_rds_password` env variable. AWS auto-rotation is disabled because our ECS tasks read `DATABASE_URL` from Doppler, which doesn't auto-sync with RDS rotation.
- **`publicly_accessible = false`** — cannot be reached from the internet, only from inside the VPC
- **`storage_encrypted = true`** — data on disk is encrypted
- **Staging:** no final snapshot on destroy (cheap teardowns), 1-day backups, no deletion protection
- **Production:** final snapshot taken before any destroy, 7-day backups, deletion protection on (Terraform will refuse to delete it without explicit override)

---

### `terraform/elasticache.tf` — Redis

Serverless Redis — you don't provision capacity upfront, it scales automatically based on usage. Much simpler than the older ElastiCache cluster setup.

**Always uses TLS.** When you set the `REDIS_URL` secret, use `rediss://` (double-s) not `redis://`.

---

### `terraform/iam.tf` — Permissions

IAM is AWS's permission system. Three roles are created:

**ECS Execution Role** — used by AWS (not your code) to:

- Pull your Docker image from ECR
- Inject the Doppler service token from SSM Parameter Store into containers
- Write logs to CloudWatch

**ECS Task Role** — used by your running app code to:

- Read/write objects in the S3 documents bucket
- Use ECS Exec (SSH-like access into a running container for migrations/debugging)

**GitHub Deploy Role** — used by GitHub Actions to:

- Push Docker images to ECR
- Register new task definitions
- Update ECS services

GitHub assumes this role via **OIDC** — no AWS access keys stored in GitHub secrets. GitHub proves its identity via a token that AWS verifies. Much more secure than rotating long-lived keys.

> **Note:** There's one gotcha — the GitHub OIDC provider is created once per AWS account, not per project. If another project already set it up in your account, Terraform will fail saying it already exists. If that happens, run `terraform import` (exact command is in the comments at the top of `iam.tf`).

---

### `terraform/alb.tf` — Load Balancer + HTTPS

The Application Load Balancer (ALB) sits in front of your ECS containers:

```
Browser → https://api-staging.yourdomain.com
              │
              ▼
        ALB (port 443, TLS 1.3)
              │
              ▼
        ECS containers (port 8000)
```

This file also handles:

- **ACM certificate** — free SSL cert from AWS, validated via DNS. Once you add the validation CNAME in Hostinger, it auto-renews forever — you never touch it again.
- **HTTP → HTTPS redirect** — port 80 redirects to 443 automatically
- **Health checks** — ALB pings `/api/v1/health/live` every 30 seconds; containers that fail 3 checks are replaced

**After `terraform apply`, two manual steps in Hostinger:**

1. Add the SSL cert validation CNAME (printed by Terraform after apply):

   ```bash
   terraform output acm_validation_cname
   # Prints: Name, Type, Value — paste these exactly into Hostinger DNS
   ```

   Do this once. The cert then auto-renews forever with no action needed.

2. Add a CNAME pointing your API subdomain at the ALB:
   ```
   Type:  CNAME
   Name:  api-staging          ← (or "api" for production)
   Value: <terraform output alb_dns_name>
   TTL:   3600
   ```

That's it — no Route 53, no DNS migration. Your domain stays at Hostinger.

---

### `terraform/cloudwatch.tf` — Logs

Creates two log groups:

- `/app/staging/api` — everything your API container prints to stdout/stderr
- `/app/staging/worker` — same for the worker container

Staging logs kept 7 days, production 30 days. View them in AWS Console → CloudWatch → Log Groups, or via CLI:

```bash
aws logs tail /app/staging/api --follow
```

---

### `terraform/doppler.tf` — Runtime Secrets via Doppler

All app environment variables (`DATABASE_URL`, `REDIS_URL`, JWT secrets, API keys, `FRONTEND_URL`, `CONSOLE_URL`, `CORS_ORIGINS`, optional LiveKit/voice settings, etc.) live in **Doppler** — not in Terraform and not in AWS Secrets Manager. See `docs/doppler.md` for setting up your Doppler project.

Terraform's only job here is storing the Doppler **service token** in SSM Parameter Store as a SecureString (`/<project>-<env>/doppler-token`). The ECS task definitions inject that one token via the `secrets` block, and the container entrypoint runs the app under `doppler run`, which fetches everything else at startup.

You pass the token at apply time:

```bash
terraform apply -var-file=environments/staging.tfvars \
  -var="doppler_token=dp.st.stg.xxxx"
```

CI does the same — the GitHub Actions deploy workflow reads `DOPPLER_TOKEN_STG` / `DOPPLER_TOKEN_PRD` from GitHub secrets and passes them to both Terraform and the migration step.

Secret values never appear in your code, task definitions, or Terraform state output (the variable is marked `sensitive`).

---

### `terraform/ecs.tf` — Where Your App Runs

ECS (Elastic Container Service) runs your Docker containers without you managing servers.

**Cluster** — a logical grouping, like a folder. Yours is called `app-staging-ecs-cluster`.

**Task Definition** — a blueprint describing a container: which image, how much CPU/memory, which environment variables, which secrets, which ports. Like a `docker run` command written as config.

Two task definitions:

- `api` — runs your NestJS backend, exposed on port 8000, behind the ALB
- `worker` — runs background jobs, no public port

**Service** — keeps N copies of a task definition running. If a container crashes, ECS restarts it automatically. During deploys, ECS starts new containers before stopping old ones (zero-downtime rolling deploy).

**Circuit breaker** — if a new deploy fails health checks repeatedly, ECS automatically rolls back to the previous version. You don't have to do anything.

**ECS Exec** — lets you run commands inside a running container (for migrations, debugging). Like SSH but for containers:

```bash
aws ecs execute-command \
  --cluster app-staging-ecs-cluster \
  --task <task-arn> \
  --container api \
  --interactive \
  --command "npx prisma migrate deploy"
```

**Auto-scaling (production only)** — production scales from 2 to 10 API tasks based on CPU usage. If CPU hits 70%, ECS adds more tasks. Staging stays at fixed counts to keep costs down.

---

### `terraform/scheduler.tf` — Staging Auto-Shutoff

Saves ~$15-20/month by scaling staging to zero containers at night and back up in the morning:

| Time (America/New_York) | Action                            |
| ----------------------- | --------------------------------- |
| 8:00 AM daily           | Start (set desired count back up) |
| 12:00 AM (midnight)     | Stop (set desired count to 0)     |

Services are down midnight–8am ET (8 hours/day). The timezone auto-adjusts for EST/EDT.

**All schedules ship `state = "DISABLED"`** — they do nothing until you deliberately flip them to `ENABLED` in `scheduler.tf` (or the AWS console) once you're ready for staging to sleep at night.

The database (RDS) keeps running 24/7 — stopping it would be more complex and the savings are smaller.

Only created for staging. Production never shuts down.

---

### `terraform/outputs.tf` — What Gets Printed After Apply

After `terraform apply` succeeds, these values are printed to your terminal:

```
Outputs:

alb_dns_name          = "app-staging-alb-api-123456.us-east-1.elb.amazonaws.com"
ecr_repository_url    = "123456789.dkr.ecr.us-east-1.amazonaws.com/app-ecr-backend"
ecs_cluster_name      = "app-staging-ecs-cluster"
github_oidc_role_arn  = "arn:aws:iam::123456789:role/app-staging-iam-role-github-deploy"
```

You need these values to:

- Push your first Docker image (use `ecr_repository_url`)
- Add GitHub secrets (use `github_oidc_role_arn`)

You can re-print them any time with: `terraform output`

---

## How the Files Connect

```
variables.tf          defines the knobs
     │
     ▼
staging.tfvars        sets the values for staging
     │
     ▼
main.tf               configures AWS provider + where to store state
     │
     ├── vpc.tf        creates the network
     │     └─ security groups used by ↓
     │
     ├── ecr.tf        creates the image registry
     │     └─ image URL used by ↓
     │
     ├── rds.tf        creates the database
     │     └─ lives in the private subnets from vpc.tf
     │
     ├── elasticache.tf creates Redis
     │     └─ lives in the private subnets from vpc.tf
     │
     ├── s3.tf         creates the documents bucket
     │     └─ CORS origins from s3_cors_origins
     │
     ├── cdn.tf        creates the public-assets bucket + CloudFront
     │
     ├── doppler.tf    stores the Doppler token in SSM
     │     └─ injected into containers by ↓
     │
     ├── iam.tf        creates permissions
     │     └─ roles attached to ↓
     │
     ├── cloudwatch.tf creates log groups
     │     └─ referenced by ↓
     │
     ├── ecs.tf        creates the cluster + task defs + services
     │     └─ sits behind ↓
     │
     ├── alb.tf        creates the load balancer + HTTPS + DNS
     │
     └── scheduler.tf  shuts down staging at night
```

---

## Common Commands

```bash
cd infra/terraform

# See what Terraform would create/change/delete (safe — makes no changes)
terraform plan -var-file=environments/staging.tfvars

# Apply changes to staging
terraform apply -var-file=environments/staging.tfvars

# Print the output values (ALB URL, ECR URL, etc.)
terraform output

# Print a specific output
terraform output -raw ecr_repository_url

# See all resources Terraform is managing
terraform state list

# If you need to look at one resource's details
terraform state show aws_ecs_service.api
```

---

## What NOT to Do

- **Never edit `.tfstate` files** — these are Terraform's internal database, not code
- **Never put real secrets in `.tf` or `.tfvars` files** — those get committed to git
- **Never run `terraform destroy`** without understanding what it will delete — it will ask for confirmation, read it carefully
- **Don't run `terraform apply` on production** until staging has been stable for at least a week

---

## Estimated Monthly Cost (Staging)

| What                  | Why                                  | Cost        |
| --------------------- | ------------------------------------ | ----------- |
| ECS Fargate (2 tasks) | Runs your app containers             | ~$8         |
| RDS PostgreSQL        | Database                             | ~$15        |
| ElastiCache Redis     | Cache                                | ~$5         |
| ALB                   | Load balancer                        | ~$16        |
| NAT Gateway           | Outbound internet for private subnet | ~$5         |
| ECR, Route 53, S3     | Registry, DNS, state storage         | ~$2         |
| **Total**             |                                      | **~$51/mo** |

With the nightly shutoff scheduler: **~$35/mo** (ECS and NAT costs drop significantly).

---

## Database Setup (After First Deploy)

Run these steps in order every time you set up a new environment.

### Step 1: Run Migrations

Applies all Prisma migrations to create the schema (including the pgvector extension and `knowledge_documents` table).

**CI does this automatically** — the deploy workflow (`.github/workflows/deploy-all.yml`) opens an SSM port-forwarding tunnel to RDS through a running ECS task and runs `prisma migrate deploy` from the CI runner.

To run migrations manually, open the SSM tunnel (see "Connecting TablePlus" below — it forwards local port 5433 → RDS 5432), then:

```bash
cd apps/backend
DATABASE_URL="postgresql://app_user:URL_ENCODED_PASSWORD@127.0.0.1:5433/app?sslmode=no-verify" \
  pnpm exec prisma migrate deploy
```

### Step 2: Run Base Seed

Seeds platform reference data: implicit tenant, super admin, feature flags, plan config, plan entitlements, vendor configs, add-ons, desk config, and AI model pricing (see `apps/backend/prisma/seeds/index.ts`). Requires SSM tunnel open (see "Connecting TablePlus" section below).

```bash
# Update .env to point at RDS via tunnel (IMPORTANT: update .env not .env.local — dotenv loads .env with priority)
sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://app_user:URL_ENCODED_PASSWORD@127.0.0.1:5433/app?sslmode=no-verify|' \
  apps/backend/.env

# Run seed
cd apps/backend && pnpm run db:seed

# Restore .env
sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://app_user:app_password@localhost:5432/app|' \
  apps/backend/.env
```

### Step 3: Seed Knowledge Base (pgvector)

Seeds the Markdown documents under `apps/backend/content/knowledge-base/` (chunked, with OpenAI embeddings) into pgvector for the AI chat feature. The template ships only a starter document set — the count depends on your content.

Requires:

- SSM tunnel open on port 5433
- Both `.env` and `.env.local` updated with RDS URL (same as Step 2)
- `OPENAI_API_KEY` set in `.env` (already there for local dev)

```bash
# Update .env to point at RDS via tunnel (IMPORTANT: update .env not .env.local — dotenv loads .env with priority)
sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://app_user:URL_ENCODED_PASSWORD@127.0.0.1:5433/app?sslmode=no-verify|' \
  apps/backend/.env

# Run knowledge seed
cd apps/backend && pnpm run seed:knowledge

# Restore .env
sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://app_user:app_password@localhost:5432/app|' \
  apps/backend/.env
```

Verify in TablePlus: `SELECT COUNT(*) FROM knowledge_documents;` → should match the number of chunks reported by the seed script.

### Step 4: Set Super Admin Firebase UID

After seeding, update the super admin user's Firebase UID in TablePlus:

```sql
UPDATE users SET "firebaseUid" = 'YOUR_FIREBASE_UID' WHERE email = 'your@email.com';
```

---

## Connecting TablePlus to RDS

RDS is in a private subnet — not reachable from the internet. Use SSM port forwarding through the running ECS task.

**Step 1: Open the tunnel (keep this terminal tab open)**

```bash
# Get current task details
TASK_ARN=$(aws ecs list-tasks --cluster app-staging-ecs-cluster --service-name app-staging-ecs-service-api --query 'taskArns[0]' --output text)
TASK_ID=$(echo $TASK_ARN | cut -d'/' -f3)
RUNTIME_ID=$(aws ecs describe-tasks --cluster app-staging-ecs-cluster --tasks $TASK_ARN --query 'tasks[0].containers[0].runtimeId' --output text)

# Start tunnel — forwards local port 5433 → RDS port 5432
# Get <RDS_ENDPOINT> from: terraform output rds_endpoint (or AWS console → RDS)
aws ssm start-session \
  --target "ecs:app-staging-ecs-cluster_${TASK_ID}_${RUNTIME_ID}" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<RDS_ENDPOINT>"],"portNumber":["5432"],"localPortNumber":["5433"]}'
```

You'll see: `Port 5433 opened for sessionId ... Waiting for connections...` — keep this tab open.

**Step 2: Connect TablePlus**

| Field    | Value                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Host     | `127.0.0.1`                                                                    |
| Port     | `5433`                                                                         |
| User     | `<project>_user` (e.g. `app_user`)                                             |
| Password | the value you set via `TF_VAR_rds_password` (also in Doppler's `DATABASE_URL`) |
| Database | `app`                                                                          |
| SSL      | **On** (required by RDS)                                                       |

Close the terminal tab when done to close the tunnel.

---

## Running Database Seeds

Seeds run from your local machine through the SSM tunnel (the production image doesn't include ts-node).

**Prerequisites:** SSM tunnel must be open (see above), tunnel on port 5433.

**Step 1: Temporarily update `.env` in apps/backend**

```bash
# Backup original
cp apps/backend/.env apps/backend/.env.local-backup

# Set DATABASE_URL to tunnel (URL-encode special chars in password)
# URL-encode the password first:
python3 -c "import urllib.parse; print(urllib.parse.quote('YOUR_RAW_PASSWORD', safe=''))"

# Then update .env:
# DATABASE_URL=postgresql://app_user:URL_ENCODED_PASSWORD@127.0.0.1:5433/app?sslmode=no-verify
```

**Step 2: Run the seed**

```bash
cd apps/backend
pnpm run db:seed
```

**Step 3: Restore `.env`**

```bash
cp apps/backend/.env.local-backup apps/backend/.env
```

> Note: `sslmode=no-verify` is required because RDS uses AWS's own CA certificate which Prisma's Rust engine rejects as self-signed. The connection is still encrypted.

---

## Staging Deployment Lessons (Feb 2026)

Issues hit during first staging deploy and how to fix them. **Read this before doing production.**

---

### 1. Docker image platform mismatch

**Problem:** Built on Apple Silicon Mac → image is `linux/arm64`. ECS Fargate expects `linux/amd64`.

**Error:** `image Manifest does not contain descriptor matching platform 'linux/amd64'`

**Fix:** Always build with `--platform linux/amd64`:

```bash
docker build --platform linux/amd64 -f apps/backend/Dockerfile -t $ECR_URL:latest .
```

---

### 2. ElastiCache Serverless incompatible with BullMQ

**Problem:** `aws_elasticache_serverless_cache` always runs in Redis Cluster mode. BullMQ uses Lua multi-key scripts (`EVAL` with multiple keys across slots) which are rejected by cluster mode.

**Error:** `ReplyError: CROSSSLOT Keys in request don't hash to the same slot`

**Fix:** Replaced with `aws_elasticache_replication_group` (standard single-node Redis, no cluster mode). `elasticache.tf` was updated accordingly. The Redis URL secret was also updated to the new endpoint.

> Do NOT use `aws_elasticache_serverless_cache` with BullMQ.

---

### 3. DB password URL-encoding

**Problem:** RDS auto-generates a password with special characters (`:`, `#`, `*`). Prisma parses `DATABASE_URL` as a URL — unencoded special chars break URL parsing.

**Error:** `PrismaClientKnownRequestError: Invalid URL`

**Fix:** URL-encode the password before putting it in the secret:

```bash
python3 -c "import urllib.parse; print(urllib.parse.quote('YOUR_PASSWORD', safe=''))"
```

Then use the encoded value in the connection string:

```
postgresql://app_user:ENCODED_PASSWORD@host:5432/app?sslmode=no-verify
```

---

### 4. RDS TLS certificate rejection

**Problem:** Prisma 7 uses a Rust-based engine that strictly validates TLS certificates. RDS uses AWS's own CA (`rds-ca-rsa2048-g1`) which is not in the standard system trust store on Alpine Linux.

**Error:** `Error opening a TLS connection: self-signed certificate in certificate chain`

**Fix:** Add `?sslmode=no-verify` to the DATABASE_URL. This encrypts the connection but skips certificate validation — acceptable inside a private VPC where you trust the network.

```
postgresql://app_user:PASSWORD@host:5432/app?sslmode=no-verify
```

> For production you could bundle the AWS RDS CA cert into the Docker image and use `sslmode=verify-full` for stricter security.

---

### 5. Prisma CLI not in production image

**Problem:** `pnpm deploy --prod` creates a self-contained bundle but doesn't include the Prisma CLI binary (only the Prisma Client). Running `npx prisma migrate deploy` inside the container fails.

**Fix:** Don't run migrations inside the production image at all. The deploy workflow (`.github/workflows/deploy-all.yml`) opens an SSM port-forwarding tunnel to RDS through a running ECS task and runs `pnpm exec prisma migrate deploy` from the CI runner, where the full repo (and Prisma CLI) is available. The same tunnel approach works for manual migrations (see "Database Setup" above).

---

### 6. Empty container secret crashes ECS at startup

> Historical: this stack originally injected ~13 individual Secrets Manager secrets. It now injects a single Doppler token from SSM (see `doppler.tf`), but the lesson still applies to that one parameter.

**Problem:** ECS fetches everything in the task definition's `secrets` block at container startup, before the app runs. If a referenced secret/parameter has no value (was created by Terraform but never populated), ECS fails to start the task entirely.

**Error:** `ResourceNotFoundException: ... can't find the specified secret value`

**Fix:** Make sure the Doppler token is set before the first deploy — pass a real `-var="doppler_token=..."` on `terraform apply` (CI passes it from the `DOPPLER_TOKEN_STG`/`DOPPLER_TOKEN_PRD` GitHub secrets).

---

### 7. zsh `!` in secret names

**Problem:** Secret names with `!` (like `rds!db-xxx`) cause zsh history expansion errors.

**Fix:** Use single quotes or the ARN instead:

```bash
# Single quotes prevent zsh expansion
aws secretsmanager get-secret-value --secret-id 'rds!db-xxx' ...

# Or use the ARN
RDS_ARN=$(aws secretsmanager list-secrets --output json | python3 -c \
  "import sys,json; [print(s['ARN']) for s in json.load(sys.stdin)['SecretList'] if 'rds' in s['Name'].lower()]")
aws secretsmanager get-secret-value --secret-id "$RDS_ARN" ...
```

---

### 8. ECS Exec requires SSM plugin + enableExecuteCommand

**Problem:** `aws ecs execute-command` requires:

1. `session-manager-plugin` installed locally (`brew install --cask session-manager-plugin`)
2. Service must have `enableExecuteCommand = true`

**Fix:** Enable it:

```bash
aws ecs update-service --cluster app-staging-ecs-cluster \
  --service app-staging-ecs-service-api \
  --enable-execute-command --force-new-deployment
```

Wait for new task, then exec into it. Note: even with this, ECS Exec may fail in private subnets without VPC endpoints for SSM — use the one-off task approach for migrations instead (see lesson 5).

---

### 9. Disable AWS CLI pager in zsh

**Problem:** AWS CLI pipes long output through `less`, showing `(END)` which blocks the terminal.

**Fix:** Add to `~/.zshrc`:

```bash
export AWS_PAGER=""
```

---

### Final working DATABASE_URL format

```
postgresql://app_user:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/app?sslmode=no-verify
```

### Final working REDIS_URL format

```
rediss://master.REPLICATION_GROUP_ID.CACHE_ID.use1.cache.amazonaws.com:6379/0
```

Note `rediss://` (double-s) for TLS. Use the `primary_endpoint_address` from `terraform output elasticache_endpoint`.
