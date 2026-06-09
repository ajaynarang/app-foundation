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
  description = "Number of worker tasks to run"
  type        = number
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

# Frontend
variable "frontend_url" {
  description = "Full URL of the frontend for this environment — used in APP_URL, FRONTEND_URL, invitation links"
  type        = string
}

variable "console_url" {
  description = "Full URL of the Console app — used in CONSOLE_URL for OAuth callback redirects"
  type        = string
}

variable "cors_origins" {
  description = "Comma-separated CORS origins for the backend. Supports wildcard patterns like https://*.example.com"
  type        = string
}

variable "s3_cors_origins" {
  description = "List of origins allowed for S3 CORS (supports wildcards like https://*.example.com)"
  type        = list(string)
}

# Voice Mode
variable "livekit_url" {
  description = "LiveKit Cloud WebSocket URL (e.g. wss://your-project.livekit.cloud)"
  type        = string
  default     = ""
}

variable "cartesia_voice_warm" {
  description = "Cartesia voice UUID for 'Warm' tone — find at https://play.cartesia.ai/"
  type        = string
  default     = "1f15f888-ce6e-4656-9c9f-fd769a11d5bc"
}

variable "cartesia_voice_confident" {
  description = "Cartesia voice UUID for 'Confident' tone"
  type        = string
  default     = "bf7d7fc1-7236-4fce-a36f-3eabed0eb39b"
}

variable "cartesia_voice_calm" {
  description = "Cartesia voice UUID for 'Calm' tone"
  type        = string
  default     = "1f15f888-ce6e-4656-9c9f-fd769a11d5bc"
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
