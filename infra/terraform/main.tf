# infra/terraform/main.tf

terraform {
  required_version = ">= 1.10" # 1.10+ required for S3 native locking (no DynamoDB needed)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "__PROJECT__-terraform-state"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true # S3 native locking — no DynamoDB table required
    # key is passed via -backend-config on CLI:
    #   staging:    -backend-config="key=staging/terraform.tfstate"
    #   production: -backend-config="key=production/terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}

locals {
  prefix = "${var.project}-${var.env}"
}
