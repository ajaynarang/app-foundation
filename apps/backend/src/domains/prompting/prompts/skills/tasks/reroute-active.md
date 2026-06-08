---
name: reroute-active
type: task
description: Reroute a driver around an obstacle
primaryAgent: route
triggers:
  - "reroute"
  - "traffic"
  - "closure"
  - "detour"
crossDomainAgents:
  - dispatch
maxSteps: 6
---

## Procedure: Reroute

1. Get current route status using get-route-status
2. Identify the obstacle (traffic, weather, road closure)
3. Calculate alternative route using plan-route
4. Compare: original ETA vs new ETA, additional miles, fuel cost impact
5. If reroute is better, recommend it to dispatch
6. Update route if approved (requires confirmation)
