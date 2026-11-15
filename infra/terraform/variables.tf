# infra/terraform/variables.tf

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "app"
}

variable "env" {
  description = "Environment name: staging or production"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain" {
  description = "Base domain name managed at Hostinger (e.g. yourdomain.com)"
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for the API ALB (e.g. api or api-staging)"
  type        = string
}

# VPC
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
}

variable "availability_zones" {
  description = "List of AZs to use"
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "Use a single shared NAT gateway instead of one per AZ (saves ~$35/month, suitable for staging)"
  type        = bool
  default     = false
}

# ECS
variable "api_cpu" {
  description = "CPU units for API task (256 = 0.25 vCPU)"
  type        = number
}

variable "api_memory" {
  description = "Memory MB for API task"
  type        = number
}

variable "api_desired_count" {
  description = "Number of API tasks to run"
  type        = number
}

variable "worker_cpu" {
  description = "CPU units for worker task"
  type        = number
}

variable "worker_memory" {
  description = "Memory MB for worker task"
  type        = number
}

variable "worker_desired_count" {
  description = "Number of worker tasks to run. 0 is allowed: the API then consumes every queue (keep api_queue_processors_enabled true) and its task gets OPS_GAUGES_FROM_API=true, so it reports the queue, cron, outbox and deadline gauges the worker would."
  type        = number
}

# Queue processing split (API and worker roles)
variable "api_queue_processors_enabled" {
  description = "When false, the API container gets QUEUE_PROCESSORS_ENABLED=false so BullMQ jobs are consumed only by the worker service. Ships true (the API consumes too). To turn it on: run at least one worker task (worker_desired_count > 0; a precondition in ecs.tf refuses otherwise), then set this to false. Roll back by setting it to true. Set the key only here, never in Doppler: Doppler values override the task environment."
  type        = bool
  default     = true
}

# Bedrock (AI routes). Both default off.
variable "bedrock_models" {
  description = "Bedrock base model ids the task role may invoke for the platform's zero-retention route (platform-bedrock): the model catalog's bedrockId without its us. prefix, plus the embedding model. Empty (the default) grants nothing. Example: [\"anthropic.claude-haiku-5-5\", \"anthropic.claude-sonnet-5-5\", \"anthropic.claude-opus-5-5\", \"cohere.embed-v4:0\"]. Then set PLATFORM_BEDROCK_REGION in Doppler."
  type        = list(string)
  default     = []
}

variable "bedrock_tenant_roles_enabled" {
  description = "Lets workspaces connect their own AWS account (BEDROCK_ROLE): grants both task roles (API and worker) sts:AssumeRole and sets PLATFORM_ASSUME_ROLE_ARN on the API and worker tasks to both task role ARNs, the principals a workspace's trust policy names. Off by default."
  type        = bool
  default     = false
}

# The worker task role split (iam.tf)
variable "worker_own_task_role" {
  description = "Run the worker task under its own task role (ecs_task_worker) instead of the API's (ecs_task). True by default, which is right for a new stack and for any stack with bedrock_tenant_roles_enabled off. A stack with workspace Bedrock roles already connected applies with false first (the worker role is created and both ARNs land in PLATFORM_ASSUME_ROLE_ARN while the worker keeps ecs_task), has each such workspace re-save its trust policy (the Settings sheet then lists both ARNs), then sets true. Otherwise worker-side calls on those credentials are denied and the revalidation sweep marks them failing."
  type        = bool
  default     = true
}

# ECS Exec. Every session is written to the ecs-exec log group (cloudwatch.tf) either way.
variable "api_enable_exec" {
  description = "ECS Exec into the API tasks. On by default: the migration jobs and tools/db/tunnel.sh use an API task as the jump host to the private database."
  type        = bool
  default     = true
}

variable "worker_enable_exec" {
  description = "ECS Exec into the worker tasks. Off by default: nothing needs a shell there, and the tunnel and migration jobs jump through the API. Turn on for an incident, then off again."
  type        = bool
  default     = false
}

# RDS
variable "rds_instance_class" {
  description = "RDS instance type"
  type        = string
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB for RDS (min 20 for gp3)"
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Ceiling (GB) for RDS storage autoscaling: RDS grows the volume on its own when free space runs low, up to this cap. 0 turns autoscaling off. Must exceed rds_allocated_storage."
  type        = number
  default     = 200

  validation {
    condition     = var.rds_max_allocated_storage == 0 || var.rds_max_allocated_storage > var.rds_allocated_storage
    error_message = "rds_max_allocated_storage is 0 (off) or larger than rds_allocated_storage."
  }
}

variable "rds_db_name" {
  description = "Name of the database"
  type        = string
  default     = "app"
}

variable "rds_password" {
  description = "Master password for the RDS instance. Set via TF_VAR_rds_password env var for initial creation. Ignored on subsequent applies (lifecycle ignore_changes)."
  type        = string
  sensitive   = true
  default     = ""
}

# GitHub OIDC
variable "github_repo" {
  description = "GitHub repo in owner/repo format (e.g. myorg/app)"
  type        = string
}

# S3
# Note: app-level URLs (FRONTEND_URL, CORS_ORIGINS, LiveKit/voice
# settings, etc.) are NOT Terraform variables — they are injected at runtime
# via Doppler (see doppler.tf and ecs.tf).
variable "s3_cors_origins" {
  description = "List of origins allowed for S3 CORS (supports wildcards like https://*.example.com)"
  type        = list(string)
}

# Container image
variable "image_tag" {
  description = "Docker image tag for ECS task definitions. CI passes the git SHA; defaults to 'latest' for manual applies."
  type        = string
  default     = "latest"
}

# Doppler
variable "doppler_token" {
  description = "Doppler service token for the environment. Injected into ECS containers; doppler run uses this to fetch all env vars at startup."
  type        = string
  sensitive   = true
}

# Observability, level 1 (docs/observability.md): CloudWatch alarms and a budget email, the no-vendor fallback.
variable "alarm_email" {
  description = "Email subscribed to the CloudWatch alarm SNS topic and to the budget. Empty (the default) creates no topic, no alarm and no budget. After the first apply AWS emails a subscription confirmation; nothing is delivered until it is confirmed."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly AWS cost budget in USD, emailed to alarm_email at 80% actual and 100% forecast. An AWS budget measures the whole account, not this stack: when staging and production share an account and both set alarm_email, set 0 in one of them so the account has one budget. 0 = no budget."
  type        = number
  default     = 100

  validation {
    condition     = var.monthly_budget_usd >= 0
    error_message = "monthly_budget_usd must be 0 (no budget) or a positive amount."
  }
}

variable "rds_connections_alarm_threshold" {
  description = "DatabaseConnections above which the level 1 alarm fires: 75% of the instance's max_connections, which RDS derives from the class (about DBInstanceClassMemory / 9531392). 75 fits a 1 GiB class (about 100); keep it in step with rdsMaxConnections in the Grafana catalog's constants.mjs."
  type        = number
  default     = 75
}

variable "container_insights" {
  description = "ECS Container Insights on the cluster. Off by default: no alarm or Grafana rule here needs it (service-gone reads the free AWS/ECS CPUUtilization metric), and it is billed per metric. Set true to keep it on an existing stack."
  type        = bool
  default     = false
}

# Observability, level 2: Grafana Cloud reads CloudWatch through a read-only role (grafana.tf).
variable "grafana_alerting_live" {
  description = "Set true as the LAST step of going to level 2 (docs/observability.md), after the Grafana rules are applied and test-fired: every level 1 CloudWatch alarm, the SNS topic and its subscription are removed in that apply. The budget stays. Production refuses it until the Grafana read-only role exists (both grafana_cloud_* values set)."
  type        = bool
  default     = false

  # In production the flag removes every CloudWatch alarm, so Grafana must already be able to read CloudWatch.
  validation {
    condition     = !(var.grafana_alerting_live && var.env == "production" && (var.grafana_cloud_aws_account_id == "" || var.grafana_cloud_external_id == ""))
    error_message = "grafana_alerting_live = true in production needs grafana_cloud_aws_account_id and grafana_cloud_external_id: the Grafana CloudWatch read role must exist before the CloudWatch alarms are removed."
  }
}

variable "grafana_cloud_aws_account_id" {
  description = "The AWS account Grafana Cloud assumes roles from (shown in its CloudWatch datasource setup). Empty = no Grafana read role."
  type        = string
  default     = ""
}

variable "grafana_cloud_external_id" {
  description = "The external id Grafana Cloud presents when it assumes the read role (shown in its CloudWatch datasource setup). Not a secret: it guards against the confused-deputy problem. Empty = no Grafana read role."
  type        = string
  default     = ""
}
