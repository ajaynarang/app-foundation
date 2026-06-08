---
name: detect-detention-opportunity
type: task
description: Identify billable detention charges
primaryAgent: billing
triggers:
  - "detention"
  - "dwell time"
  - waiting.*hours
crossDomainAgents:
  - dispatch
maxSteps: 6
---

## Procedure: Detect Detention

1. Get load detail with stop timestamps using get-load-detail
2. Calculate dwell time at each stop (arrival to departure)
3. Compare against standard free time (typically 2 hours)
4. If dwell time exceeds free time, calculate detention charge
5. Present findings: stop, dwell time, billable hours, estimated charge
6. Offer to add detention charge to load using confirm-action
