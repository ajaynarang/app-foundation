---
name: report-arrival
type: task
description: Driver reports arrival at a stop
primaryAgent: driver
triggers:
  - "arrived"
  - "i'm here"
  - at.*pickup
  - at.*delivery
maxSteps: 3
---

## Procedure: Report Arrival

1. Identify which stop the driver is at (pickup or delivery)
2. Update stop status to arrived using update-stop-status (requires confirmation)
3. Confirm arrival recorded and provide next instructions
