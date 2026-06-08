---
name: evaluate-rate-con
type: task
description: Evaluate if a rate is worth accepting
primaryAgent: billing
triggers:
  - "counter"
  - "negotiate"
  - rate.*low
  - should.*take
  - "worth it"
crossDomainAgents:
  - route
maxSteps: 6
---

## Procedure: Evaluate Rate

1. Get the load details and proposed rate
2. Calculate rate per mile (total rate / estimated miles)
3. Compare to market average for this lane
4. Delegate to route agent: estimate fuel cost and toll cost for this route
5. Calculate estimated profit margin: rate - (fuel + driver pay + overhead)
6. Recommend: take, counter, or reject with reasoning
