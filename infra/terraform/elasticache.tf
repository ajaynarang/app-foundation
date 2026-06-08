# infra/terraform/elasticache.tf
#
# Standard ElastiCache Redis (single-node, no cluster mode).
# BullMQ uses Lua multi-key scripts that are incompatible with Redis Cluster mode,
# so ElastiCache Serverless (which forces cluster mode) cannot be used here.

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.prefix}-elasticache-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${local.prefix}-elasticache-subnet-group" }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.prefix}-redis"
  description          = "Redis for ${local.prefix} - single node, no cluster mode"

  engine             = "redis"
  engine_version     = "7.1"
  node_type          = "cache.t3.micro"
  num_cache_clusters = 1

  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.elasticache.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"

  apply_immediately = true

  tags = { Name = "${local.prefix}-redis" }
}
