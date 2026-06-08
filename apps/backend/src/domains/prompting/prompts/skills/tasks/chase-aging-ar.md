---
name: chase-aging-ar
type: task
description: Review and act on overdue invoices
primaryAgent: billing
triggers:
  - "aging"
  - "overdue"
  - "past due"
  - "who owes"
  - "collections"
maxSteps: 6
---

## Procedure: Chase Aging AR

1. Query invoices with status OVERDUE using query-invoices
2. Group by customer and calculate totals per aging bucket (30/60/90+ days)
3. For each customer, show: total owed, oldest invoice, payment history using get-customer-payment-stats
4. Recommend actions: resend invoice (30 days), phone follow-up (60 days), hold future loads (90+ days)
5. For invoices ready to resend, offer to send-invoice (requires confirmation)
