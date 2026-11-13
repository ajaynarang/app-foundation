# infra/terraform/grafana.tf
#
# The read-only role Grafana Cloud's CloudWatch datasource assumes to read the free basic AWS metrics (RDS,
# ElastiCache, ECS, ALB) behind the catalog's infra rules (level 2 of docs/observability.md, step 2). Created only
# when both Grafana account values are set. The name carries the environment prefix, so two states never collide, and
# matches the deploy role's `grafana-*` grant (iam.tf). It is the only Grafana resource in Terraform: alert rules,
# routing and dashboards are applied from infra/observability/grafana-cloud/ by script.

locals {
  grafana_cloudwatch_role_enabled = var.grafana_cloud_aws_account_id != "" && var.grafana_cloud_external_id != ""
}

resource "aws_iam_role" "grafana_cloudwatch" {
  count = local.grafana_cloudwatch_role_enabled ? 1 : 0
  name  = "${local.prefix}-iam-role-grafana-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.grafana_cloud_aws_account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "sts:ExternalId" = var.grafana_cloud_external_id }
      }
    }]
  })

  tags = { Name = "${local.prefix}-iam-role-grafana-cloudwatch" }

  # A CI apply runs as the deploy role, whose grant to create this role may arrive in the same apply.
  depends_on = [aws_iam_role_policy.github_deploy]
}

resource "aws_iam_role_policy" "grafana_cloudwatch_read" {
  count = local.grafana_cloudwatch_role_enabled ? 1 : 0
  name  = "${local.prefix}-iam-policy-grafana-cloudwatch-read"
  role  = aws_iam_role.grafana_cloudwatch[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "CloudWatchMetricsRead"
      Effect = "Allow"
      Action = [
        "cloudwatch:GetMetricData",
        "cloudwatch:ListMetrics",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:DescribeAlarmsForMetric",
        "ec2:DescribeRegions",
        "tag:GetResources",
      ]
      # These read APIs take no resource-level permission.
      Resource = "*"
    }]
  })
}

output "grafana_cloudwatch_role_arn" {
  description = "Role ARN to paste into Grafana Cloud's CloudWatch datasource (empty until both grafana_cloud_* values are set)."
  value       = local.grafana_cloudwatch_role_enabled ? aws_iam_role.grafana_cloudwatch[0].arn : ""
}
