---
name: handle-billing-dispute
type: task
description: Investigate and resolve billing disputes
primaryAgent: billing
triggers:
  - "dispute"
  - "billing issue"
  - "charge wrong"
  - "overcharged"
crossDomainAgents:
  - compliance
maxSteps: 8
---

## Procedure: Handle Billing Dispute

1. Get the disputed invoice details using get-invoice-detail
2. Get the original load charges using get-load-charges
3. Compare invoice charges vs rate con terms
4. If document discrepancy, delegate to compliance: verify rate con and BOL match
5. Identify the discrepancy and explain to user
6. If adjustment needed, present the corrected amount
7. Offer to void and regenerate invoice if needed (requires confirmation)
