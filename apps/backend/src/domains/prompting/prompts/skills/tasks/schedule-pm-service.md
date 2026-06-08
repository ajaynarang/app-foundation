---
name: schedule-pm-service
type: task
description: Schedule preventive maintenance for a vehicle
primaryAgent: maintenance
triggers:
  - pm.*due
  - "oil change"
  - service.*due
  - maintenance.*schedule
crossDomainAgents:
  - dispatch
maxSteps: 6
---

## Procedure: Schedule PM

1. Get vehicle detail using get-vehicle-detail
2. Check current mileage vs last PM mileage
3. Determine what service is due (oil, tires, brakes, annual inspection)
4. Check vehicle's current assignment — is it on a load?
5. Delegate to dispatch: find a window when vehicle is available
6. Recommend service date, location, and expected downtime
