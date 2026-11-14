# Offline: the AWS provider is mocked, so `terraform test` needs no credentials and creates nothing. The mock fills
# computed values at plan time (`override_during = plan`).
# Run from infra/terraform: terraform init -backend=false && terraform test
#
# Terraform hardening (docs/upgrade-notes/operations.md): the worker has its own task role, ECS Exec is off on the
# worker and on for the API (the migration tunnel's jump host), every Exec session is logged, the production deploy
# role trusts exactly main and the production environment, and the AI permissions from the Bedrock variables sit on
# both task roles with both ARNs in PLATFORM_ASSUME_ROLE_ARN.

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

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:us-east-1:123456789012:log-group:/mock"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

# Distinct ARNs for the two task roles, so "the worker runs under its own role" compares two different values.
override_resource {
  target          = aws_iam_role.ecs_task
  override_during = plan
  values = {
    arn = "arn:aws:iam::123456789012:role/api-task"
  }
}

override_resource {
  target          = aws_iam_role.ecs_task_worker
  override_during = plan
  values = {
    arn = "arn:aws:iam::123456789012:role/worker-task"
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

run "worker_has_its_own_role_and_no_exec_by_default" {
  command = plan

  assert {
    condition     = aws_iam_role.ecs_task_worker.arn != aws_iam_role.ecs_task.arn
    error_message = "The worker task role must be a different role from the API task role."
  }

  assert {
    condition     = aws_ecs_task_definition.worker.task_role_arn == aws_iam_role.ecs_task_worker.arn
    error_message = "By default (worker_own_task_role = true) the worker task runs under its own role."
  }

  assert {
    condition     = aws_ecs_task_definition.api.task_role_arn == aws_iam_role.ecs_task.arn
    error_message = "The API task runs under the API role, never the worker role."
  }

  assert {
    condition     = aws_ecs_service.worker.enable_execute_command == false
    error_message = "ECS Exec on the worker is off by default (worker_enable_exec)."
  }

  assert {
    condition     = aws_ecs_service.api.enable_execute_command == true
    error_message = "ECS Exec on the API is on by default: the migration tunnel jumps through an API task."
  }

  assert {
    condition     = strcontains(aws_iam_role_policy.github_deploy.policy, aws_iam_role.ecs_task_worker.arn)
    error_message = "The deploy role must be allowed to pass the worker task role, or a deploy cannot register the worker task definition."
  }
}

run "every_exec_session_is_logged" {
  command = plan

  assert {
    condition     = aws_ecs_cluster.main.configuration[0].execute_command_configuration[0].logging == "OVERRIDE"
    error_message = "The cluster must send ECS Exec sessions to its own log configuration."
  }

  assert {
    condition     = aws_ecs_cluster.main.configuration[0].execute_command_configuration[0].log_configuration[0].cloud_watch_log_group_name == aws_cloudwatch_log_group.ecs_exec.name
    error_message = "ECS Exec sessions go to the ecs-exec log group."
  }

  assert {
    condition     = aws_cloudwatch_log_group.ecs_exec.name == "/app/staging/ecs-exec"
    error_message = "The ecs-exec log group sits beside the api and worker groups."
  }

  assert {
    condition = alltrue([
      for p in [aws_iam_role_policy.ecs_task_ssm.policy, aws_iam_role_policy.ecs_task_worker_ssm.policy] :
      contains([for st in jsondecode(p).Statement : st.Sid], "EcsExecTranscript")
    ])
    error_message = "Both task roles may write the Exec transcript (the agent inside the task writes it)."
  }
}

run "staging_trust_is_any_ref" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] == ["repo:example-org/example-repo:*"]
    error_message = "Staging keeps repo:<repo>:* so a branch can be deployed there to be tried."
  }
}

run "production_trust_is_main_and_the_production_environment" {
  command = plan

  variables {
    env = "production"
  }

  assert {
    condition = jsondecode(aws_iam_role.github_deploy.assume_role_policy).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] == [
      "repo:example-org/example-repo:ref:refs/heads/main",
      "repo:example-org/example-repo:environment:production",
    ]
    error_message = "The production deploy role trusts exactly two subjects: the main branch and the production environment."
  }
}

run "bedrock_off_by_default_on_both_roles" {
  command = plan

  assert {
    condition = (
      length(aws_iam_role_policy.ecs_task_bedrock) == 0 &&
      length(aws_iam_role_policy.ecs_task_worker_bedrock) == 0 &&
      length(aws_iam_role_policy.ecs_task_assume_tenant_bedrock_roles) == 0 &&
      length(aws_iam_role_policy.ecs_task_worker_assume_tenant_bedrock_roles) == 0
    )
    error_message = "With the defaults neither task role carries a Bedrock or AssumeRole statement."
  }

  assert {
    condition = alltrue([
      for td in [aws_ecs_task_definition.api, aws_ecs_task_definition.worker] :
      !contains([for e in jsondecode(td.container_definitions)[0].environment : e.name], "PLATFORM_ASSUME_ROLE_ARN")
    ])
    error_message = "With the defaults no task definition sets PLATFORM_ASSUME_ROLE_ARN."
  }
}

run "bedrock_on_reaches_both_roles" {
  command = plan

  variables {
    bedrock_models               = ["anthropic.claude-haiku-5-5"]
    bedrock_tenant_roles_enabled = true
  }

  assert {
    condition = alltrue([
      for p in [aws_iam_role_policy.ecs_task_bedrock[0], aws_iam_role_policy.ecs_task_worker_bedrock[0]] :
      contains(jsondecode(p.policy).Statement[0].Action, "bedrock:InvokeModel")
    ])
    error_message = "Both task roles carry the Bedrock invoke statement when bedrock_models is set."
  }

  assert {
    condition     = aws_iam_role_policy.ecs_task_bedrock[0].role == aws_iam_role.ecs_task.id && aws_iam_role_policy.ecs_task_worker_bedrock[0].role == aws_iam_role.ecs_task_worker.id
    error_message = "One Bedrock invoke policy on each task role."
  }

  assert {
    condition = alltrue([
      for p in [aws_iam_role_policy.ecs_task_assume_tenant_bedrock_roles[0], aws_iam_role_policy.ecs_task_worker_assume_tenant_bedrock_roles[0]] :
      jsondecode(p.policy).Statement[0].Action == "sts:AssumeRole"
    ])
    error_message = "Both task roles may assume a workspace's Bedrock role when bedrock_tenant_roles_enabled."
  }

  assert {
    condition     = aws_iam_role_policy.ecs_task_assume_tenant_bedrock_roles[0].role == aws_iam_role.ecs_task.id && aws_iam_role_policy.ecs_task_worker_assume_tenant_bedrock_roles[0].role == aws_iam_role.ecs_task_worker.id
    error_message = "One AssumeRole policy on each task role."
  }

  assert {
    condition = alltrue([
      for td in [aws_ecs_task_definition.api, aws_ecs_task_definition.worker] :
      contains(
        [for e in jsondecode(td.container_definitions)[0].environment : "${e.name}=${e.value}"],
        "PLATFORM_ASSUME_ROLE_ARN=arn:aws:iam::123456789012:role/api-task,arn:aws:iam::123456789012:role/worker-task",
      )
    ])
    error_message = "Both task definitions list both task role ARNs in PLATFORM_ASSUME_ROLE_ARN."
  }
}

# Step one of the split on a stack with workspace Bedrock roles connected: the worker role exists and is already in
# PLATFORM_ASSUME_ROLE_ARN, but the worker keeps running under ecs_task until those workspaces trust the new role.
run "worker_keeps_the_shared_role_until_switched" {
  command = plan

  variables {
    bedrock_tenant_roles_enabled = true
    worker_own_task_role         = false
  }

  assert {
    condition     = aws_ecs_task_definition.worker.task_role_arn == aws_iam_role.ecs_task.arn
    error_message = "With worker_own_task_role = false the worker task definition still uses ecs_task."
  }

  assert {
    condition = contains(
      [for e in jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment : "${e.name}=${e.value}"],
      "PLATFORM_ASSUME_ROLE_ARN=arn:aws:iam::123456789012:role/api-task,arn:aws:iam::123456789012:role/worker-task",
    )
    error_message = "Both ARNs are listed before the switch, so workspaces can add the worker role first."
  }
}

run "rds_storage_autoscaling" {
  command = plan

  assert {
    condition     = aws_db_instance.postgres.max_allocated_storage == 200
    error_message = "Storage autoscaling is on by default, capped at rds_max_allocated_storage."
  }
}

run "rds_storage_autoscaling_off" {
  command = plan

  variables {
    rds_max_allocated_storage = 0
  }

  assert {
    condition     = aws_db_instance.postgres.max_allocated_storage == null || aws_db_instance.postgres.max_allocated_storage == 0
    error_message = "rds_max_allocated_storage = 0 leaves storage autoscaling off."
  }
}

run "rds_storage_cap_must_exceed_the_allocation" {
  command = plan

  variables {
    rds_max_allocated_storage = 20
  }

  expect_failures = [var.rds_max_allocated_storage]
}
