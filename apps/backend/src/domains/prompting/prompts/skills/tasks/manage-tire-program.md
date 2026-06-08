---
name: manage-tire-program
type: task
description: Monitor and manage fleet tire program
primaryAgent: maintenance
triggers:
  - "tire"
  - "retread"
  - tread.*depth
  - "blowout"
maxSteps: 4
---

## Procedure: Tire Management

1. Get fleet status to identify vehicles
2. Check tire-related maintenance records
3. Identify: tires below tread depth thresholds, retreading candidates, recent blowout history
4. Recommend: replacements, retreads, pressure checks, or full tire program review
