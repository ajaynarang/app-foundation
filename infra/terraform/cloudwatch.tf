# infra/terraform/cloudwatch.tf

resource "aws_cloudwatch_log_group" "api" {
  name              = "/sally/${var.env}/api"
  retention_in_days = var.env == "production" ? 30 : 7
  tags              = { Name = "${local.prefix}-logs-api" }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/sally/${var.env}/worker"
  retention_in_days = var.env == "production" ? 30 : 7
  tags              = { Name = "${local.prefix}-logs-worker" }
}
