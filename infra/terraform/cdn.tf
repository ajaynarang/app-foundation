# infra/terraform/cdn.tf
# S3 + CloudFront CDN for static marketing assets (videos, images)
# Only rendered video outputs go here — not source files.
#
# Usage:
#   aws s3 cp out/master.mp4 s3://${bucket}/videos/demo.mp4
#   aws s3 cp out/trailer.mp4 s3://${bucket}/videos/launch.mp4
#
# Files served at: https://cdn.${domain}/videos/demo.mp4

# ─── S3 Bucket ───

resource "aws_s3_bucket" "cdn" {
  bucket = "${local.prefix}-cdn"
  tags   = { Name = "${local.prefix}-cdn" }
}

resource "aws_s3_bucket_public_access_block" "cdn" {
  bucket                  = aws_s3_bucket.cdn.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cdn" {
  bucket = aws_s3_bucket.cdn.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_cors_configuration" "cdn" {
  bucket = aws_s3_bucket.cdn.id
  cors_rule {
    allowed_origins = ["https://*.${var.domain}", "http://localhost:3000"]
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = ["*"]
    max_age_seconds = 86400
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cdn" {
  bucket = aws_s3_bucket.cdn.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

# ─── CloudFront Origin Access Control ───

resource "aws_cloudfront_origin_access_control" "cdn" {
  name                              = "${local.prefix}-cdn-oac"
  description                       = "OAC for ${local.prefix}-cdn S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ─── S3 Bucket Policy (allow CloudFront via OAC) ───

resource "aws_s3_bucket_policy" "cdn" {
  bucket = aws_s3_bucket.cdn.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.cdn.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.cdn.arn
          }
        }
      }
    ]
  })
}

# ─── CloudFront Distribution ───

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.prefix} CDN — marketing videos and static assets"
  default_root_object = ""
  price_class         = "PriceClass_100" # US + Europe (cheapest, covers your audience)
  http_version        = "http2and3"

  origin {
    domain_name              = aws_s3_bucket.cdn.bucket_regional_domain_name
    origin_id                = "s3-cdn"
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn.id
  }

  # Maintenance status endpoint — short TTL for near-real-time state
  ordered_cache_behavior {
    path_pattern           = "/status/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-cdn"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # 30-second TTL — balance between freshness and S3 cost
    min_ttl     = 0
    default_ttl = 30
    max_ttl     = 60

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-cdn"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # Cache for 30 days, respect S3 headers
    min_ttl     = 0
    default_ttl = 2592000 # 30 days
    max_ttl     = 31536000 # 1 year

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      cookies {
        forward = "none"
      }
    }

    # CORS headers
    response_headers_policy_id = aws_cloudfront_response_headers_policy.cdn_cors.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # To use custom domain (cdn.appshore.in), add:
    # acm_certificate_arn      = aws_acm_certificate.cdn.arn
    # ssl_support_method       = "sni-only"
    # minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${local.prefix}-cdn" }
}

# ─── CORS Response Headers Policy ───

resource "aws_cloudfront_response_headers_policy" "cdn_cors" {
  name    = "${local.prefix}-cdn-cors"
  comment = "CORS headers for video/asset delivery"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD"]
    }

    access_control_allow_origins {
      items = [
        "https://*.${var.domain}",
        "https://staging.example.com",
        "https://example.com",
        "http://localhost:3000",
      ]
    }

    access_control_max_age_sec = 86400
    origin_override            = true
  }
}

# ─── Outputs ───

output "cdn_bucket_name" {
  description = "S3 bucket name for CDN assets"
  value       = aws_s3_bucket.cdn.id
}

output "cdn_bucket_arn" {
  description = "S3 bucket ARN for CDN assets"
  value       = aws_s3_bucket.cdn.arn
}

output "cdn_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.cdn.id
}

output "cdn_domain_name" {
  description = "CloudFront domain name — use this URL for video src"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "cdn_video_urls" {
  description = "Full URLs for the marketing videos"
  value = {
    demo   = "https://${aws_cloudfront_distribution.cdn.domain_name}/videos/demo.mp4"
    launch = "https://${aws_cloudfront_distribution.cdn.domain_name}/videos/launch.mp4"
  }
}
