---
name: close-out-load
type: task
description: Complete end-to-end load close-out — status, docs, invoice, settlement
primaryAgent: billing
triggers:
  - "close out"
  - "closeout"
  - "finalize load"
  - "wrap up load"
  - "ready to bill"
  - close.?out
crossDomainAgents:
  - compliance
  - payroll
maxSteps: 8
---

## Procedure: Close Out Load

1. Get load details using get-load-detail
2. Verify load status is DELIVERED or COMPLETED
3. Delegate to compliance agent: check document compliance for this load (POD, BOL, rate con all present)
4. If documents missing, inform user which docs are needed — do NOT proceed
5. Verify billing readiness using get-billing-readiness
6. Verify all charges are correct using get-load-charges
7. Generate invoice using generate-invoice (requires confirmation)
8. Delegate to payroll agent: check if this load's settlement is ready
9. Summarize: invoice generated, settlement status, any outstanding items
