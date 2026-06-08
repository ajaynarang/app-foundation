---
name: assign-load-to-driver
type: task
description: Assign a load to the best available driver
primaryAgent: dispatch
triggers:
  - "assign"
  - dispatch.*driver
  - put.*on.*load
crossDomainAgents:
  - route
maxSteps: 8
---

## Procedure: Assign Load

1. Get load details using get-load-detail (pickup location, delivery, timing)
2. Get fleet status using get-fleet-status to see available drivers
3. Filter drivers by: equipment type match, location proximity, HOS availability
4. For top candidates, check HOS using get-driver-hos
5. Delegate to route agent: estimate drive time from driver location to pickup
6. Present ranked options: driver name, current location, ETA to pickup, remaining hours
7. Assign selected driver using assign-load (requires confirmation)
8. Confirm assignment and provide pickup ETA
