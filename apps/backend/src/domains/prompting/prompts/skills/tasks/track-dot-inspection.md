---
name: track-dot-inspection
type: task
description: Track DOT annual inspection status
primaryAgent: maintenance
triggers:
  - dot.*inspection
  - annual.*inspection
  - inspection.*due
crossDomainAgents:
  - compliance
maxSteps: 4
---

## Procedure: Track DOT Inspection

1. Get vehicle detail using get-vehicle-detail
2. Check last annual inspection date
3. Calculate days until inspection expires (must be within 12 months)
4. If due within 30 days, recommend scheduling. If overdue, flag as critical.
