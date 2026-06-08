# infra/terraform/iam.tf

# Current AWS account ID — used to scope IAM policy resources to this account only.
data "aws_caller_identity" "current" {}

# --- ECS Execution Role ---
# Used by ECS control plane to pull images from ECR and push logs to CloudWatch.

resource "aws_iam_role" "ecs_execution" {
  name = "${local.prefix}-iam-role-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow execution role to read the Doppler service token from SSM Parameter Store.
# ECS injects this into containers via the `secrets` block in the task definition.
resource "aws_iam_role_policy" "ecs_execution_ssm_doppler" {
  name = "${local.prefix}-ecs-execution-ssm-doppler"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters"]
      Resource = aws_ssm_parameter.doppler_token.arn
    }]
  })
}

# --- ECS Task Role ---
# Used by the running container (app code) — SSM for ECS Exec, S3 for documents.

resource "aws_iam_role" "ecs_task" {
  name = "${local.prefix}-iam-role-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Allow ECS Exec (SSM) for running migrations and debugging (enable_execute_command on services).
resource "aws_iam_role_policy" "ecs_task_ssm" {
  name = "${local.prefix}-ecs-task-ssm"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ]
      # SSM channel actions cannot be scoped to a specific resource — must be *.
      Resource = "*"
    }]
  })
}

# Allow ECS tasks to read/write/delete objects in the S3 documents bucket.
resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${local.prefix}-ecs-task-s3"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.documents.arn}/*"
    }]
  })
}

# --- GitHub Actions OIDC Role ---
# GitHub Actions assumes this role via OIDC — no long-lived AWS keys needed.
#
# IMPORTANT: The GitHub OIDC provider (token.actions.githubusercontent.com) is a
# GLOBAL resource — one per AWS account, shared across all projects.
#
# If it already exists in your account, import it before running terraform apply:
#   terraform import aws_iam_openid_connect_provider.github \
#     arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com
#
# To check: aws iam list-open-id-connect-providers | grep github
#
# This resource is created once (for the account) by whichever environment applies first.
# The second environment's apply will fail with AlreadyExistsException unless you import it.
# Recommended: import into both staging and production state files.

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC thumbprints — AWS now validates against its own CA bundle,
  # but the thumbprint list is still required. These values are stable.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  lifecycle {
    # Thumbprints may be rotated by GitHub; ignore drift to prevent unnecessary replacement.
    ignore_changes = [thumbprint_list]
  }
}

resource "aws_iam_role" "github_deploy" {
  name = "${local.prefix}-iam-role-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "${local.prefix}-github-deploy-policy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # GetAuthorizationToken cannot be scoped to a specific repo — must be *.
        Sid      = "ECRAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]
        # Scoped to the specific ECR repository, not *.
        Resource = local.ecr_repository_arn
      },
      {
        Sid    = "ECSDeployment"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:ListTaskDefinitions",
          "ecs:TagResource",
          # Run one-off migration tasks before deploying new code
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "ecs:StopTask"
        ]
        Resource = "*"
      },
      {
        Sid      = "MigrationLogs"
        Effect   = "Allow"
        Action   = ["logs:GetLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${local.prefix}-*"
      },
      {
        Sid    = "PassRoleToECSAndScheduler"
        Effect = "Allow"
        Action = ["iam:PassRole"]
        Resource = concat(
          [
            aws_iam_role.ecs_execution.arn,
            aws_iam_role.ecs_task.arn,
          ],
          var.env == "staging" ? [aws_iam_role.scheduler[0].arn] : []
        )
      },
      {
        # SSM port-forwarding tunnel to private RDS for migrations
        Sid    = "SSMTunnel"
        Effect = "Allow"
        Action = [
          "ssm:StartSession",
          "ssm:TerminateSession",
          "ssm:ResumeSession"
        ]
        Resource = [
          "arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:task/${local.prefix}-ecs-cluster/*",
          "arn:aws:ssm:*::document/AWS-StartPortForwardingSessionToRemoteHost"
        ]
      },
      {
        # List running ECS tasks to find SSM jump host
        Sid      = "ECSListTasks"
        Effect   = "Allow"
        Action   = ["ecs:ListTasks"]
        Resource = "*"
      },
      {
        # Terraform state — S3 backend for CI-driven terraform apply
        Sid    = "TerraformState"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::sally-terraform-state",
          "arn:aws:s3:::sally-terraform-state/*"
        ]
      },
      {
        # Terraform apply needs read/write access to all managed infrastructure.
        # Scoped to the services Terraform manages (ECS, EC2/VPC, RDS, ElastiCache,
        # ALB, S3, ACM, CloudWatch Logs, EventBridge Scheduler).
        Sid    = "TerraformInfraManage"
        Effect = "Allow"
        Action = [
          # ECS (task definitions, services, clusters)
          "ecs:CreateService",
          "ecs:UpdateService",
          "ecs:DeleteService",
          "ecs:DescribeServices",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:ListTaskDefinitions",
          "ecs:DescribeClusters",
          "ecs:TagResource",
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "ecs:StopTask",
          "ecs:ListTasks",

          # EC2 / VPC (read-only — VPC infra is stable, Terraform just reads it)
          "ec2:Describe*",

          # RDS (read-only — DB instance already exists, password ignored)
          "rds:DescribeDBInstances",
          "rds:DescribeDBSubnetGroups",
          "rds:ListTagsForResource",

          # ElastiCache
          "elasticache:Describe*",
          "elasticache:ListTagsForResource",

          # ALB / Target Groups
          "elasticloadbalancing:Describe*",

          # S3 (buckets managed by Terraform — CORS, lifecycle, encryption, CDN)
          "s3:CreateBucket",
          "s3:PutBucketPolicy",
          "s3:PutBucketPublicAccessBlock",
          "s3:PutEncryptionConfiguration",
          "s3:PutLifecycleConfiguration",
          "s3:PutBucketTagging",
          "s3:GetBucket*",
          "s3:GetEncryptionConfiguration",
          "s3:ListBucket",
          "s3:PutBucketCors",
          "s3:GetAccelerateConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetReplicationConfiguration",
          "s3:GetAnalyticsConfiguration",
          "s3:GetBucketObjectLockConfiguration",
          "s3:GetIntelligentTieringConfiguration",
          "s3:GetInventoryConfiguration",
          "s3:GetMetricsConfiguration",

          # CloudFront (CDN distribution, OAC, response headers)
          "cloudfront:CreateDistribution",
          "cloudfront:UpdateDistribution",
          "cloudfront:GetDistribution",
          "cloudfront:ListDistributions",
          "cloudfront:TagResource",
          "cloudfront:ListTagsForResource",
          "cloudfront:CreateOriginAccessControl",
          "cloudfront:GetOriginAccessControl",
          "cloudfront:UpdateOriginAccessControl",
          "cloudfront:DeleteOriginAccessControl",
          "cloudfront:ListOriginAccessControls",
          "cloudfront:CreateResponseHeadersPolicy",
          "cloudfront:GetResponseHeadersPolicy",
          "cloudfront:UpdateResponseHeadersPolicy",
          "cloudfront:DeleteResponseHeadersPolicy",
          "cloudfront:ListResponseHeadersPolicies",

          # ACM (certificates)
          "acm:DescribeCertificate",
          "acm:ListTagsForCertificate",

          # CloudWatch Logs
          "logs:DescribeLogGroups",
          "logs:ListTagsForResource",
          "logs:ListTagsLogGroup",

          # IAM (manage own roles/policies — Terraform updates IAM policies on deploy)
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:GetOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviders",
          "iam:ListInstanceProfilesForRole",

          # SSM Parameter Store (Doppler token storage)
          # Note: ssm:DescribeParameters requires Resource: * (cannot be scoped)
          "ssm:PutParameter",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:DeleteParameter",
          "ssm:DescribeParameters",
          "ssm:AddTagsToResource",
          "ssm:ListTagsForResource",

          # Secrets Manager (delete during migration — can be removed after migration completes)
          "secretsmanager:DeleteSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:UpdateSecretVersionStage",

          # EventBridge Scheduler
          "scheduler:GetSchedule",
          "scheduler:ListSchedules",
          "scheduler:UpdateSchedule",
          "scheduler:CreateSchedule",
          "scheduler:DeleteSchedule",
          "scheduler:TagResource",

          # ECR (read — Terraform reads repo state)
          "ecr:DescribeRepositories",
          "ecr:GetLifecyclePolicy",
          "ecr:ListTagsForResource"
        ]
        Resource = "*"
      }
    ]
  })
}
