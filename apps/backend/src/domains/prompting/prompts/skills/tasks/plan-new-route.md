---
name: plan-new-route
type: task
description: Plan a new route with HOS compliance
primaryAgent: route
triggers:
  - "plan route"
  - how.*get.*to
  - "best route"
crossDomainAgents:
  - compliance
maxSteps: 6
---

## Procedure: Plan Route

1. Get origin, destination, and any stops from user
2. Get driver's current HOS using get-driver-hos
3. Plan route using plan-route tool
4. Verify driver can legally complete the route within HOS limits
5. If HOS insufficient, suggest break/rest stops along the route
6. Present: total miles, estimated time, fuel stops, rest stops, arrival ETA
