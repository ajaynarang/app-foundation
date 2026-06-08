---
name: optimize-fuel-purchasing
type: task
description: Optimize fleet fuel purchasing strategy
primaryAgent: fuel
triggers:
  - cheapest.*fuel
  - fuel.*discount
  - fleet.*rate
  - bulk.*fuel
crossDomainAgents:
  - route
maxSteps: 4
---

## Procedure: Optimize Fuel Purchasing

1. Get current fleet routes and fuel consumption data
2. Identify major fuel stops along common routes
3. Compare prices: fleet card discounts vs retail, chain vs independent
4. Recommend: preferred stops by route, bulk purchasing opportunities, estimated savings
