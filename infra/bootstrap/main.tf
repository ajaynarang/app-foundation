# infra/bootstrap/main.tf
# Run this ONCE manually to create the S3 state bucket.
# After this, all other Terraform configs use this bucket as their backend.
#
# Usage:
#   cd infra/bootstrap
#   terraform init
#   terraform apply

terraform {
  required_version = ">= 1.10"  # Required for S3 native locking (no DynamoDB needed)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "sally-terraform-state"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Project   = "sally"
    ManagedBy = "terraform-bootstrap"
  }
}

# Versioning: lets you recover a previous state file if something goes wrong
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Encrypt state at rest (contains resource ARNs and some config values)
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access — state file must never be publicly readable
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
