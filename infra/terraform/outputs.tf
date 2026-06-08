# infra/terraform/outputs.tf

output "alb_dns_name" {
  description = "ALB DNS name — add this as a CNAME in Hostinger pointing api-staging.yourdomain.com here"
  value       = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL for backend image"
  value       = local.ecr_repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint — use this to build your DATABASE_URL secret"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "elasticache_endpoint" {
  description = "ElastiCache Redis endpoint — use this to build your REDIS_URL secret (prefix with rediss://)"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "github_oidc_role_arn" {
  description = "IAM role ARN — add as STAGING_OIDC_ROLE_ARN GitHub secret"
  value       = aws_iam_role.github_deploy.arn
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = aws_acm_certificate.api.arn
}

output "s3_documents_bucket" {
  description = "S3 bucket for document storage"
  value       = aws_s3_bucket.documents.id
}

output "acm_validation_cname" {
  description = "Add this CNAME record in Hostinger to validate the SSL cert (one-time — enables auto-renew)"
  value = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}
