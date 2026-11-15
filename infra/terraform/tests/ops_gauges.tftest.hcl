# Offline: the AWS provider is mocked, so `terraform test` needs no credentials and creates nothing. The mock fills
# computed values at plan time (`override_during = plan`), with valid ARNs where the ECS task definitions read them.
# Run from infra/terraform: terraform init -backend=false && terraform test

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

# The ops gauges (queue depth, cron intervals, outbox and deadline ages) come from one process role. With a worker
# task that is the worker, and the API task must not carry the key.
run "worker_reports_ops_gauges" {
  command = plan

  assert {
    condition = !contains(
      [for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : e.name],
      "OPS_GAUGES_FROM_API",
    )
    error_message = "With a worker task the API must not report the ops gauges (they would be counted twice)."
  }

  assert {
    condition = !contains(
      [for e in jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment : e.name],
      "OPS_GAUGES_FROM_API",
    )
    error_message = "The worker reports by its process role; it never needs OPS_GAUGES_FROM_API."
  }
}

# With no worker task the API consumes every queue, so it reports the gauges; otherwise outbox-backlog,
# deadline-sweep-late, queue-stalled and cron-missed would be silent.
run "api_reports_ops_gauges_without_a_worker" {
  command = plan

  variables {
    worker_desired_count = 0
  }

  assert {
    condition = contains(
      [for e in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].environment : "${e.name}=${e.value}"],
      "OPS_GAUGES_FROM_API=true",
    )
    error_message = "With worker_desired_count = 0 the API task must set OPS_GAUGES_FROM_API=true."
  }
}
