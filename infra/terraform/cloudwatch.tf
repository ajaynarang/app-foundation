# infra/terraform/cloudwatch.tf

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${var.project}/${var.env}/api"
  retention_in_days = var.env == "production" ? 30 : 7
  tags              = { Name = "${local.prefix}-logs-api" }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/${var.project}/${var.env}/worker"
  retention_in_days = var.env == "production" ? 30 : 7
  tags              = { Name = "${local.prefix}-logs-worker" }
}

# ECS Exec session transcripts: every command typed into a task and what it printed (the cluster's
# execute_command_configuration in ecs.tf). Kept longer than the app logs because it is the audit trail of who ran what
# inside a production task.
resource "aws_cloudwatch_log_group" "ecs_exec" {
  name              = "/${var.project}/${var.env}/ecs-exec"
  retention_in_days = var.env == "production" ? 365 : 30
  tags              = { Name = "${local.prefix}-logs-ecs-exec" }
}
