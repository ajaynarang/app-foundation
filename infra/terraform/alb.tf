# infra/terraform/alb.tf
#
# DNS is managed at Hostinger — no Route 53.
#
# After terraform apply, two manual steps in Hostinger DNS:
#
#   Step 1 — SSL cert validation CNAME (one-time, enables auto-renew forever):
#     Run: terraform output acm_validation_cname
#     Add that CNAME record exactly as shown in Hostinger.
#
#   Step 2 — Point your subdomain at the ALB:
#     Type:  CNAME
#     Name:  api-staging   (or "api" for production)
#     Value: <terraform output alb_dns_name>
#     TTL:   3600

# ACM SSL certificate — DNS validation
# Terraform creates the cert and prints the CNAME you need to add in Hostinger.
# Once you add it, AWS validates and the cert auto-renews forever — no action needed again.
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${local.prefix}-acm-api" }
}

# Waits for DNS validation to complete before the HTTPS listener uses the cert.
# You must add the CNAME record in Hostinger first — run:
#   terraform output acm_validation_cname
resource "aws_acm_certificate_validation" "api" {
  certificate_arn = aws_acm_certificate.api.arn
}

# Application Load Balancer
resource "aws_lb" "api" {
  name               = "${local.prefix}-alb-api"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  drop_invalid_header_fields = true

  tags = { Name = "${local.prefix}-alb-api" }
}

# Target group — ECS tasks register here via awsvpc networking
resource "aws_lb_target_group" "api" {
  name        = "${local.prefix}-tg-api"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/api/v1/health/live"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  slow_start = 60

  tags = { Name = "${local.prefix}-tg-api" }
}

# HTTPS listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP → HTTPS redirect
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
