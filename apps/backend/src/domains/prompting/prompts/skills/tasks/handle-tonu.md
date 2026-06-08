---
name: handle-tonu
type: task
description: Process truck ordered not used cancellation
primaryAgent: dispatch
triggers:
  - "tonu"
  - "truck ordered not used"
  - cancel.*load
crossDomainAgents:
  - billing
maxSteps: 6
---

## Procedure: Handle TONU

1. Get load details using get-load-detail
2. Verify load is in DISPATCHED status (TONU only valid after dispatch)
3. Document cancellation reason from user
4. Update load status back to PENDING or CANCELLED (requires confirmation)
5. Delegate to billing agent: generate TONU charge for this customer
6. Confirm: load cancelled, TONU charge created, driver freed for reassignment
