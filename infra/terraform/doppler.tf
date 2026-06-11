# infra/terraform/doppler.tf
# Stores the Doppler service token in SSM Parameter Store (SecureString).
# ECS containers read this via the `secrets` block, preventing the token
# from appearing in plaintext in task definitions.

resource "aws_ssm_parameter" "doppler_token" {
  name  = "/${local.prefix}/doppler-token"
  type  = "SecureString"
  value = var.doppler_token

  tags = { Name = "${local.prefix}-doppler-token" }

  # Note: the value is masked in plan output because var.doppler_token is
  # marked sensitive and the provider treats SecureString values as sensitive.
}
