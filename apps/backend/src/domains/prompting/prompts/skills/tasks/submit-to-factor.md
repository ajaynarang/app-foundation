---
name: submit-to-factor
type: task
primaryAgent: billing
triggers:
  - submit to factor
  - factor
  - factor invoice
  - send to factor
  - need cash
  - factor this
maxSteps: 4
---

## Procedure
1. Get invoice details using get-invoice-detail. Verify billingPath is FACTORED and status is SENT or PARTIAL.
2. Check NOA status for this customer-factor pair. If not ACKNOWLEDGED, warn the user.
3. Show doc bundle status: which docs are available (Rate Con, BOL, POD). Show estimated advance based on rate card (advance rate % × invoice total).
4. Submit to factor using submit-to-factor (requires confirmation). Optionally email doc bundle to factoring company.
