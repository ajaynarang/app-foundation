# infra/terraform/ecs.tf

resource "aws_ecs_cluster" "main" {
  name = "${local.prefix}-ecs-cluster"

  # Off by default (var.container_insights): no alarm or Grafana rule needs it, and it is billed per metric.
  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }

  tags = { Name = "${local.prefix}-ecs-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# The role a workspace's AWS Bedrock role must trust: the task role the API and the worker share. Set only when
# bedrock_tenant_roles_enabled, so the task definitions stay byte-identical while it is off. Set it here, never in
# Doppler: Doppler values override the task environment.
locals {
  bedrock_tenant_role_env = var.bedrock_tenant_roles_enabled ? [
    { name = "PLATFORM_ASSUME_ROLE_ARN", value = aws_iam_role.ecs_task.arn },
  ] : []

  # Exactly one process role reports the ops gauges (queue depth, cron intervals, outbox and deadline ages), so
  # nothing is counted twice: the worker. With no worker task the API consumes every queue and reports them instead.
  # Set only here, never in Doppler (Doppler values override the task environment). Emitted only with no worker, so
  # an existing stack's API task definition stays byte-identical.
  ops_gauges_from_api_env = var.worker_desired_count == 0 ? [
    { name = "OPS_GAUGES_FROM_API", value = "true" },
  ] : []
}

# --- API Task Definition ---

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-ecs-taskdef-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${local.ecr_repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{
      containerPort = 8000
      protocol      = "tcp"
    }]

    # Doppler injects all env vars (secrets + config) at container startup via doppler run.
    # The Doppler service token is stored in SSM Parameter Store (SecureString) to prevent
    # it from appearing in plaintext in the ECS task definition.
    command = ["doppler", "run", "--fallback", "/tmp/.doppler-fallback.json", "--", "node", "dist/main"]

    # QUEUE_PROCESSORS_ENABLED=false stops the API from consuming BullMQ jobs so only
    # the worker does. Emitted only when turned off: the backend defaults to consuming,
    # and an empty list keeps the existing task definition byte-identical.
    # NOTE: `doppler run` lets Doppler values override container env vars, so this
    # key must NOT also be set in that environment's Doppler config.
    environment = concat(
      var.api_queue_processors_enabled ? [] : [
        { name = "QUEUE_PROCESSORS_ENABLED", value = "false" },
      ],
      local.bedrock_tenant_role_env,
      local.ops_gauges_from_api_env,
    )

    secrets = [
      { name = "DOPPLER_TOKEN", valueFrom = aws_ssm_parameter.doppler_token.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:8000/api/v1/health/live || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "${local.prefix}-ecs-taskdef-api" }

  lifecycle {
    # A producer-only API with no worker task stops every queue: the outbox relay,
    # the deadline sweeper and every job. Start a worker first, then flip the switch.
    precondition {
      condition     = var.api_queue_processors_enabled || var.worker_desired_count > 0
      error_message = "api_queue_processors_enabled = false needs worker_desired_count > 0: with no worker task nothing would consume the queues. Run at least one worker task first."
    }
  }
}

# --- Worker Task Definition ---

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.prefix}-ecs-taskdef-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${local.ecr_repository_url}:${var.image_tag}"
    essential = true

    # Doppler injects all env vars (secrets + config) at container startup
    command = ["doppler", "run", "--fallback", "/tmp/.doppler-fallback.json", "--", "node", "dist/worker.js"]

    environment = local.bedrock_tenant_role_env

    secrets = [
      { name = "DOPPLER_TOKEN", valueFrom = aws_ssm_parameter.doppler_token.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])

  tags = { Name = "${local.prefix}-ecs-taskdef-worker" }
}

# --- ECS Services ---

resource "aws_ecs_service" "api" {
  name            = "${local.prefix}-ecs-service-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  # Enable ECS Exec for running migrations and debugging without SSH.
  # Usage: aws ecs execute-command --cluster <cluster> --task <task-arn> \
  #          --container api --interactive --command "npx prisma migrate deploy"
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]

  tags = { Name = "${local.prefix}-ecs-service-api" }
}

resource "aws_ecs_service" "worker" {
  name            = "${local.prefix}-ecs-service-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = { Name = "${local.prefix}-ecs-service-worker" }
}

# --- Auto-scaling (production only) ---
# Staging runs fixed task counts to keep costs low.
# Production scales the API service based on CPU utilization.

resource "aws_appautoscaling_target" "api" {
  count              = var.env == "production" ? 1 : 0
  max_capacity       = 10
  min_capacity       = var.api_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  count              = var.env == "production" ? 1 : 0
  name               = "${local.prefix}-asg-policy-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api[0].resource_id
  scalable_dimension = aws_appautoscaling_target.api[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.api[0].service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0 # Scale out when CPU hits 70% — adjust based on load testing
    scale_in_cooldown  = 300  # 5 min cooldown before scaling in (avoids thrashing)
    scale_out_cooldown = 60   # 1 min cooldown before scaling out (respond quickly to spikes)

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
