---
name: handle-breakdown
type: task
description: Coordinate response to vehicle breakdown
primaryAgent: maintenance
triggers:
  - "breakdown"
  - "broke down"
  - "roadside"
  - "tow"
  - "won't start"
crossDomainAgents:
  - dispatch
  - route
maxSteps: 8
---

## Procedure: Handle Breakdown

1. Get driver's current location
2. Assess the issue: can it be fixed roadside or needs tow?
3. If roadside fix possible, arrange mobile mechanic
4. If tow needed, arrange tow to nearest qualified shop
5. Delegate to dispatch: reassign the current load to another driver
6. Delegate to route: reroute if load is time-sensitive
7. Provide driver with ETA for assistance
8. Track repair status and estimated return to service
