# infra/terraform/rds.tf

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.prefix}-rds-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.prefix}-rds-subnet-group" }
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.prefix}-rds-postgres"

  engine         = "postgres"
  engine_version = "16.6" # Pin full version to avoid silent minor-version drift
  instance_class = var.rds_instance_class

  db_name  = var.rds_db_name
  username = "sally_user"
  password = var.rds_password
  # Static password — managed via Terraform variable (stored in terraform.tfvars or CI secrets).
  # Rotation disabled to keep sally-staging-secret-db-url in sync.
  # Previously used manage_master_user_password = true, but auto-rotation caused
  # the ECS container's DATABASE_URL secret to go stale (RDS rotates its own
  # secret but not our app-level sally-staging-secret-db-url).
  # Note: manage_master_user_password omitted — AWS provider v5 conflicts when
  # both `password` and `manage_master_user_password = false` are set.

  allocated_storage = var.rds_allocated_storage
  storage_type      = "gp3" # Better price/performance than gp2; no provisioned IOPS needed at this scale
  storage_encrypted = true  # Always encrypt at rest — required for most compliance frameworks

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = var.rds_multi_az
  publicly_accessible = false

  # Only take a final snapshot in production; staging can be destroyed cleanly.
  skip_final_snapshot       = var.env == "staging" ? true : false
  final_snapshot_identifier = var.env == "production" ? "${local.prefix}-rds-final-snapshot" : null

  backup_retention_period = var.env == "production" ? 7 : 1
  deletion_protection     = var.env == "production" ? true : false

  # pgvector extension: enable via migration: CREATE EXTENSION IF NOT EXISTS vector;
  # Supported on RDS PostgreSQL 15+ with the pgvector extension already bundled.

  tags = { Name = "${local.prefix}-rds-postgres" }

  lifecycle {
    # Password was set at creation and is managed out-of-band (Secrets Manager).
    # Ignore it so CI doesn't need the password for routine deploys.
    ignore_changes = [password]
  }
}
