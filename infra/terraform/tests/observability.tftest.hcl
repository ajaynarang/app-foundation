# Offline: the AWS provider is mocked, so `terraform test` needs no credentials and creates nothing.
# Run from infra/terraform: terraform init -backend=false && terraform test
#
# Level 1 of docs/observability.md: with defaults nothing is created; alarm_email turns on the CloudWatch alarms, their
# SNS topic and the budget; grafana_alerting_live removes the alarms (not the budget); the Grafana read-only role
# exists only when both Grafana account values are set.

mock_provider "aws" {
  override_during = plan

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:us-east-1:123456789012:parameter/mock"
    }
  }

  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:us-east-1:123456789012:repository/mock"
      repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/mock"
    }
  }

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:mock"
    }
  }
}

variables {
  project              = "app"
  env                  = "staging"
  aws_region           = "us-east-1"
  domain               = "example.com"
  api_subdomain        = "api"
  vpc_cidr             = "10.0.0.0/16"
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]
  availability_zones   = ["us-east-1a", "us-east-1b"]
  api_cpu              = 512
  api_memory           = 1024
  api_desired_count    = 1
  worker_cpu           = 512
  worker_memory        = 1024
  worker_desired_count = 1
  rds_instance_class   = "db.t4g.micro"
  github_repo          = "example-org/example-repo"
  s3_cors_origins      = ["https://example.com"]
  doppler_token        = "dp.st.example"
}

# Level 0: no alarm, topic, budget or Grafana role, and Container Insights off.
run "defaults_create_nothing" {
  command = plan

  assert {
    condition     = length(aws_sns_topic.alerts) == 0 && length(aws_sns_topic_subscription.alerts_email) == 0
    error_message = "With no alarm_email there must be no SNS topic or subscription."
  }

  assert {
    condition = sum([
      length(aws_cloudwatch_metric_alarm.alb_target_5xx),
      length(aws_cloudwatch_metric_alarm.alb_elb_5xx),
      length(aws_cloudwatch_metric_alarm.alb_unhealthy_hosts),
      length(aws_cloudwatch_metric_alarm.rds_cpu),
      length(aws_cloudwatch_metric_alarm.rds_free_storage),
      length(aws_cloudwatch_metric_alarm.rds_freeable_memory),
      length(aws_cloudwatch_metric_alarm.rds_connections),
      length(aws_cloudwatch_metric_alarm.redis_memory),
      length(aws_cloudwatch_metric_alarm.ecs_service_gone),
    ]) == 0
    error_message = "With no alarm_email there must be no CloudWatch alarm."
  }

  assert {
    condition     = length(aws_budgets_budget.monthly) == 0
    error_message = "With no alarm_email there must be no budget."
  }

  assert {
    condition     = length(aws_iam_role.grafana_cloudwatch) == 0 && length(aws_iam_role_policy.grafana_cloudwatch_read) == 0
    error_message = "With no Grafana account values there must be no Grafana role."
  }

  assert {
    condition     = one([for s in aws_ecs_cluster.main.setting : s.value if s.name == "containerInsights"]) == "disabled"
    error_message = "Container Insights is off unless container_insights = true."
  }

  assert {
    condition = toset([for st in jsondecode(aws_iam_role_policy.github_deploy.policy).Statement : st.Sid if contains(
      ["GrafanaRoleManage", "AlarmsRead", "AlarmsMaintain", "BudgetRead"], st.Sid
    )]) == toset(["GrafanaRoleManage"])
    error_message = "With defaults the deploy role may manage the Grafana role and has no alarm or budget grant."
  }
}

# Level 1 with a worker: ten alarms, the topic with its email subscription, and the budget.
run "alarm_email_creates_level_1" {
  command = plan

  variables {
    alarm_email = "ops@example.com"
  }

  assert {
    condition     = length(aws_sns_topic.alerts) == 1 && aws_sns_topic_subscription.alerts_email[0].endpoint == "ops@example.com"
    error_message = "alarm_email must create the SNS topic and subscribe the address."
  }

  assert {
    condition = sum([
      length(aws_cloudwatch_metric_alarm.alb_target_5xx),
      length(aws_cloudwatch_metric_alarm.alb_elb_5xx),
      length(aws_cloudwatch_metric_alarm.alb_unhealthy_hosts),
      length(aws_cloudwatch_metric_alarm.rds_cpu),
      length(aws_cloudwatch_metric_alarm.rds_free_storage),
      length(aws_cloudwatch_metric_alarm.rds_freeable_memory),
      length(aws_cloudwatch_metric_alarm.rds_connections),
      length(aws_cloudwatch_metric_alarm.redis_memory),
      length(aws_cloudwatch_metric_alarm.ecs_service_gone),
    ]) == 10
    error_message = "Level 1 is ten alarms: ALB 5xx (two), unhealthy hosts, RDS CPU, storage, memory and connections, Redis memory, and service-gone for the API and the worker."
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.ecs_service_gone)) == toset(["api", "worker"])
    error_message = "With a worker task both service-gone alarms exist."
  }

  assert {
    condition = alltrue([
      for a in values(aws_cloudwatch_metric_alarm.ecs_service_gone) :
      a.namespace == "AWS/ECS" && a.metric_name == "CPUUtilization" && a.treat_missing_data == "breaching"
    ])
    error_message = "Service-gone reads AWS/ECS CPUUtilization (no Container Insights) and treats missing data as breaching."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.ecs_service_gone["worker"].dimensions.ServiceName == "app-staging-ecs-service-worker"
    error_message = "The worker alarm must name the worker service as the Grafana catalog's awsNames does."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.rds_connections[0].threshold == 75
    error_message = "The connection alarm defaults to 75 (75% of a 1 GiB class's ~100 max_connections)."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.redis_memory[0].dimensions.CacheClusterId == "app-staging-redis-001"
    error_message = "The Redis alarm must name the replication group's one member, as the Grafana catalog does."
  }

  assert {
    condition = length(aws_budgets_budget.monthly) == 1 && toset([
      for n in aws_budgets_budget.monthly[0].notification : "${n.notification_type}:${n.threshold}"
    ]) == toset(["ACTUAL:80", "FORECASTED:100"])
    error_message = "The budget emails at 80% actual and 100% forecast."
  }

  assert {
    condition = toset([for st in jsondecode(aws_iam_role_policy.github_deploy.policy).Statement : st.Sid if contains(
      ["AlarmsRead", "AlarmsMaintain", "BudgetRead"], st.Sid
    )]) == toset(["AlarmsRead", "AlarmsMaintain", "BudgetRead"])
    error_message = "With alarm_email the deploy role can refresh and remove the alarms and read the budget."
  }
}

# The worker is optional: with no worker task its service-gone alarm would fire for good.
run "no_worker_no_worker_alarm" {
  command = plan

  variables {
    alarm_email          = "ops@example.com"
    worker_desired_count = 0
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.ecs_service_gone)) == toset(["api"])
    error_message = "With worker_desired_count = 0 only the API service-gone alarm exists."
  }
}

# Level 2 cut-over: the flag removes every alarm and the topic, and keeps the budget.
run "grafana_alerting_live_removes_alarms_keeps_budget" {
  command = plan

  variables {
    alarm_email           = "ops@example.com"
    grafana_alerting_live = true
  }

  assert {
    condition = length(aws_sns_topic.alerts) == 0 && length(aws_cloudwatch_metric_alarm.rds_cpu) == 0 && length(
      aws_cloudwatch_metric_alarm.ecs_service_gone
    ) == 0
    error_message = "grafana_alerting_live must remove the alarms and their topic."
  }

  assert {
    condition     = length(aws_budgets_budget.monthly) == 1
    error_message = "The budget outlives the alarms."
  }
}

run "budget_zero_skips_budget" {
  command = plan

  variables {
    alarm_email        = "ops@example.com"
    monthly_budget_usd = 0
  }

  assert {
    condition     = length(aws_budgets_budget.monthly) == 0 && length(aws_sns_topic.alerts) == 1
    error_message = "monthly_budget_usd = 0 skips the budget and keeps the alarms (a second environment in one account)."
  }
}

# The read-only role Grafana's CloudWatch datasource assumes, only when both account values are set.
run "grafana_role_when_both_values_set" {
  command = plan

  variables {
    grafana_cloud_aws_account_id = "111122223333"
    grafana_cloud_external_id    = "example-external-id"
  }

  assert {
    condition     = length(aws_iam_role.grafana_cloudwatch) == 1 && aws_iam_role.grafana_cloudwatch[0].name == "app-staging-iam-role-grafana-cloudwatch"
    error_message = "Both Grafana values must create the read-only role, named under the deploy role's grafana-* grant."
  }

  assert {
    condition = jsondecode(aws_iam_role.grafana_cloudwatch[0].assume_role_policy).Statement[0].Condition.StringEquals["sts:ExternalId"] == "example-external-id" && jsondecode(
      aws_iam_role.grafana_cloudwatch[0].assume_role_policy
    ).Statement[0].Principal.AWS == "arn:aws:iam::111122223333:root"
    error_message = "The role trusts only Grafana's account, with the external id."
  }

  assert {
    condition = alltrue([
      for a in jsondecode(aws_iam_role_policy.grafana_cloudwatch_read[0].policy).Statement[0].Action :
      startswith(a, "cloudwatch:Get") || startswith(a, "cloudwatch:List") || startswith(a, "cloudwatch:Describe") || a == "ec2:DescribeRegions" || a == "tag:GetResources"
    ])
    error_message = "The Grafana role is read-only."
  }
}

run "grafana_role_needs_both_values" {
  command = plan

  variables {
    grafana_cloud_aws_account_id = "111122223333"
  }

  assert {
    condition     = length(aws_iam_role.grafana_cloudwatch) == 0
    error_message = "One Grafana value alone must not create the role."
  }
}

# Production refuses to remove its alarms before Grafana can read CloudWatch.
run "production_refuses_live_without_grafana_role" {
  command = plan

  variables {
    env                   = "production"
    alarm_email           = "ops@example.com"
    grafana_alerting_live = true
  }

  expect_failures = [var.grafana_alerting_live]
}

run "container_insights_opt_in" {
  command = plan

  variables {
    container_insights = true
  }

  assert {
    condition     = one([for s in aws_ecs_cluster.main.setting : s.value if s.name == "containerInsights"]) == "enabled"
    error_message = "container_insights = true keeps Container Insights on."
  }
}
