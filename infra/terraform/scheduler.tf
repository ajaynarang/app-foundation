# infra/terraform/scheduler.tf
# EventBridge Scheduler: automatically stops staging ECS services outside
# business hours and restarts them in the morning to save costs.
# Only created when env = "staging".
#
# Schedule (America/New_York — auto-adjusts for EST/EDT):
#   Start: 8am ET Mon-Sun
#   Stop:  12am (midnight) ET Mon-Sun
# Services are DOWN 12am-8am ET (8 hours/day)

resource "aws_scheduler_schedule" "staging_api_stop" {
  count = var.env == "staging" ? 1 : 0

  name                         = "${local.prefix}-schedule-api-stop"
  state                        = "DISABLED"
  schedule_expression          = "cron(0 0 ? * * *)"
  schedule_expression_timezone = "America/New_York"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler[0].arn

    input = jsonencode({
      Cluster      = aws_ecs_cluster.main.name
      Service      = aws_ecs_service.api.name
      DesiredCount = 0
    })
  }
}

resource "aws_scheduler_schedule" "staging_api_start" {
  count = var.env == "staging" ? 1 : 0

  name                         = "${local.prefix}-schedule-api-start"
  state                        = "DISABLED"
  schedule_expression          = "cron(0 8 ? * * *)"
  schedule_expression_timezone = "America/New_York"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler[0].arn

    input = jsonencode({
      Cluster      = aws_ecs_cluster.main.name
      Service      = aws_ecs_service.api.name
      DesiredCount = var.api_desired_count
    })
  }
}

resource "aws_scheduler_schedule" "staging_worker_stop" {
  count = var.env == "staging" ? 1 : 0

  name                         = "${local.prefix}-schedule-worker-stop"
  state                        = "DISABLED"
  schedule_expression          = "cron(0 0 ? * * *)"
  schedule_expression_timezone = "America/New_York"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler[0].arn

    input = jsonencode({
      Cluster      = aws_ecs_cluster.main.name
      Service      = aws_ecs_service.worker.name
      DesiredCount = 0
    })
  }
}

resource "aws_scheduler_schedule" "staging_worker_start" {
  count = var.env == "staging" ? 1 : 0

  name                         = "${local.prefix}-schedule-worker-start"
  state                        = "DISABLED"
  schedule_expression          = "cron(0 8 ? * * *)"
  schedule_expression_timezone = "America/New_York"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler[0].arn

    input = jsonencode({
      Cluster      = aws_ecs_cluster.main.name
      Service      = aws_ecs_service.worker.name
      DesiredCount = var.worker_desired_count
    })
  }
}

# IAM role for EventBridge Scheduler to call ECS UpdateService
resource "aws_iam_role" "scheduler" {
  count = var.env == "staging" ? 1 : 0
  name  = "${local.prefix}-iam-role-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  count = var.env == "staging" ? 1 : 0
  name  = "${local.prefix}-scheduler-policy"
  role  = aws_iam_role.scheduler[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSUpdateService"
        Effect = "Allow"
        Action = ["ecs:UpdateService"]
        Resource = [
          aws_ecs_service.api.id,
          aws_ecs_service.worker.id,
        ]
      },
      # S3MaintenanceState permission removed — see TODO above re: Body field limitation
    ]
  })
}

# ─── Maintenance Mode: S3 state file ───
# TODO: EventBridge Scheduler Universal Target for s3:putObject does not support
# the Body field. Need to use a Lambda or Step Function to write maintenance.json.
# Tracked for follow-up implementation.
#
# Writes maintenance.json to CDN bucket BEFORE services stop,
# clears it AFTER services start. The frontend reads this via CloudFront.
