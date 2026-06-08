---
name: investigate-delay
type: task
description: Investigate why a route is delayed
primaryAgent: route
triggers:
  - why.*delayed
  - traffic.*update
crossDomainAgents:
  - dispatch
maxSteps: 6
---

## Procedure: Investigate Delay

1. Get route status using get-route-status
2. Check for traffic incidents, weather alerts, or road closures on route
3. Check driver HOS — is driver stopped due to hours?
4. Identify cause: traffic, weather, HOS break, mechanical, facility delay
5. Estimate new arrival time
6. Recommend: wait it out, reroute, or notify customer
