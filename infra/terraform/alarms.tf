# infra/terraform/alarms.tf
#
# Level 1 of docs/observability.md: a small set of CloudWatch alarms emailed through one SNS topic, the fallback for a
# product with no observability vendor. Created only when var.alarm_email is set AND var.grafana_alerting_live is
# false. Setting grafana_alerting_live (the last step of going to level 2, once the Grafana rules are applied and
# test-fired) removes every alarm here, the topic and the subscription in one apply. The budget (budget.tf) stays.
#
# After the first apply AWS emails a subscription confirmation to var.alarm_email; nothing is delivered until that
# link is clicked. Every alarm also notifies on recovery (ok_actions), so a page is followed by an all clear.
#
# The Grafana catalog (infra/observability/grafana-cloud/catalog/alert-rules.mjs) carries the same infra signals as
# rules, with the same thresholds and resource names (its awsNames mirrors the names below).
#
# Staging's night shutoff (scheduler.tf, shipped DISABLED) stops both services: if you enable it, leave alarm_email
# empty for staging, or the service-gone alarms fire every night.

locals {
  alarms_enabled = var.alarm_email != "" && !var.grafana_alerting_live
  alarm_count    = local.alarms_enabled ? 1 : 0
  alarm_actions  = local.alarms_enabled ? [aws_sns_topic.alerts[0].arn] : []

  # Single-node replication group (elasticache.tf): its one member is <id>-001, the CacheClusterId the metric carries.
  redis_cache_cluster_id = "${aws_elasticache_replication_group.redis.replication_group_id}-001"

  # The worker is optional (worker_desired_count may be 0, and the API then consumes every queue). A service with no
  # task sends no CPU metric, so its service-gone alarm would fire for good: it exists only while a worker runs.
  ecs_gone_services = local.alarms_enabled ? merge(
    { api = aws_ecs_service.api.name },
    var.worker_desired_count > 0 ? { worker = aws_ecs_service.worker.name } : {},
  ) : {}
}

resource "aws_sns_topic" "alerts" {
  count = local.alarm_count
  name  = "${local.prefix}-alerts"
  tags  = { Name = "${local.prefix}-alerts" }
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = local.alarm_count
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ─── ALB ───

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-alb-target-5xx"
  alarm_description   = "The API answered more than 10 5xx responses in 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.api.arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "alb_elb_5xx" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-alb-elb-5xx"
  alarm_description   = "The load balancer itself answered more than 10 5xx (502, 503, 504: no healthy target, timeouts) in 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.api.arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  count             = local.alarm_count
  alarm_name        = "${local.prefix}-alb-unhealthy-hosts"
  alarm_description = "At least one API target has been unhealthy for 5 minutes."
  namespace         = "AWS/ApplicationELB"
  metric_name       = "UnHealthyHostCount"
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ─── ECS: a service with no running task ───
# AWS/ECS CPUUtilization is a free basic metric (no Container Insights). It stops arriving when no task of the
# service runs, so missing data is the outage: breaching.

resource "aws_cloudwatch_metric_alarm" "ecs_service_gone" {
  for_each = local.ecs_gone_services

  alarm_name        = "${local.prefix}-ecs-${each.key}-service-gone"
  alarm_description = "No ${each.key} task has reported CPU for 10 minutes: the ${each.key} service is down."
  namespace         = "AWS/ECS"
  metric_name       = "CPUUtilization"
  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.value
  }
  statistic           = "SampleCount"
  period              = 60
  evaluation_periods  = 10
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ─── RDS ───

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-rds-cpu-high"
  alarm_description   = "RDS CPU above 80% for 10 minutes: consider a larger class."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-rds-free-storage-low"
  alarm_description   = "RDS free storage below 5 GB: Postgres stops accepting writes when the disk fills."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5 * 1024 * 1024 * 1024 # bytes
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-rds-freeable-memory-low"
  alarm_description   = "RDS freeable memory below 40 MB for 15 minutes: consider a larger class."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 40 * 1024 * 1024 # bytes; a small instance idles near 100 MB, so a higher line fires when healthy
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-rds-connections-high"
  alarm_description   = "RDS connections above ${var.rds_connections_alarm_threshold} for 10 minutes; new connections fail at max_connections."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.rds_connections_alarm_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ─── ElastiCache ───
# BullMQ needs maxmemory-policy noeviction: at 100% Redis refuses writes, so new jobs fail to enqueue.

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  count               = local.alarm_count
  alarm_name          = "${local.prefix}-redis-memory-high"
  alarm_description   = "Redis memory above 80%; with noeviction every write fails at 100%."
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  dimensions          = { CacheClusterId = local.redis_cache_cluster_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

output "alerts_sns_topic_arn" {
  description = "SNS topic receiving the level 1 CloudWatch alarms (empty when alarm_email is unset or grafana_alerting_live is true)."
  value       = local.alarms_enabled ? aws_sns_topic.alerts[0].arn : ""
}
