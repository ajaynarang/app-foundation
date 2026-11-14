# infra/terraform/budget.tf
#
# Level 1 of docs/observability.md: a monthly cost budget emailed to var.alarm_email at 80% of actual spend and when
# the month is forecast to pass 100%. Not gated on grafana_alerting_live: the budget email outlives the CloudWatch
# alarms, because Grafana does not watch the AWS bill.
#
# An AWS cost budget measures the whole account, not this stack. When staging and production share one account and
# both set alarm_email, set monthly_budget_usd = 0 in one of them so the account has one budget.

locals {
  budget_enabled = var.alarm_email != "" && var.monthly_budget_usd > 0
}

resource "aws_budgets_budget" "monthly" {
  count        = local.budget_enabled ? 1 : 0
  name         = "${local.prefix}-account-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alarm_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alarm_email]
  }
}
