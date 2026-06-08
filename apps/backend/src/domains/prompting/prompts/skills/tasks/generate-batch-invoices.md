---
name: generate-batch-invoices
type: task
description: Invoice all delivered loads in batch
primaryAgent: billing
triggers:
  - "batch invoice"
  - "invoice all"
  - "bill all delivered"
maxSteps: 8
---

## Procedure: Batch Invoice Generation

1. Query loads with billing_status = 'ready_to_bill' using get-billing-readiness
2. Show the user a summary: X loads ready, total estimated billing
3. For each load, verify charges using get-load-charges
4. Present the list for confirmation
5. Generate invoices one by one using generate-invoice (each requires confirmation)
6. Report results: X invoices generated, Y skipped (with reasons)
