---
name: investigate-late-delivery
type: task
description: Diagnose why a delivery is late or at risk
primaryAgent: dispatch
triggers:
  - late.*delivery
  - delivery.*late
  - "delayed"
  - "behind schedule"
  - where is.*load
  - where is.*driver
crossDomainAgents:
  - route
  - compliance
maxSteps: 8
---

## Procedure: Investigate Late Delivery

1. Get load details using get-load-detail
2. Get route status using get-route-status for current location and ETA
3. Check driver HOS using get-driver-hos — is driver out of hours?
4. Delegate to route agent: check for traffic, weather, or road closures on route
5. Identify root cause: HOS exhausted, traffic/weather, mechanical issue, shipper delay
6. Calculate new estimated delivery time
7. Recommend action: reroute, swap driver, notify customer, or wait
8. If customer notification needed, provide suggested message
