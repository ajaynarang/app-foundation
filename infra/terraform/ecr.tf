# infra/terraform/ecr.tf
#
# ECR is a single shared repository — image tag (git SHA) determines which
# version each environment runs.
#
# Staging OWNS the ECR repository (so you can deploy staging before production
# is ever set up). Production reads it via a data source.
#
# Ordering when you eventually bring up production:
#   1. terraform apply -var-file=environments/staging.tfvars    (creates repo)
#   2. terraform apply -var-file=environments/production.tfvars (reads repo)

# Staging creates the ECR repository.
resource "aws_ecr_repository" "backend" {
  count                = var.env == "staging" ? 1 : 0
  name                 = "${var.project}-ecr-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${var.project}-ecr-backend" }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  count      = var.env == "staging" ? 1 : 0
  repository = aws_ecr_repository.backend[0].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 20 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

# Production reads the repository that staging created.
data "aws_ecr_repository" "backend" {
  count = var.env == "production" ? 1 : 0
  name  = "${var.project}-ecr-backend"
}

# Unified local — works identically in both environments.
locals {
  ecr_repository_url = var.env == "staging" ? aws_ecr_repository.backend[0].repository_url : data.aws_ecr_repository.backend[0].repository_url
  ecr_repository_arn = var.env == "staging" ? aws_ecr_repository.backend[0].arn : data.aws_ecr_repository.backend[0].arn
}
