---
name: find-fuel-stop
type: task
description: Help driver find nearby fuel
primaryAgent: driver
triggers:
  - "fuel"
  - "gas"
  - "diesel"
  - where.*fill
maxSteps: 3
---

## Procedure: Find Fuel

1. Get driver's current route using get-my-route
2. Find fuel stops ahead on the route
3. Recommend the best option: cheapest with fleet discount, within 20 miles
