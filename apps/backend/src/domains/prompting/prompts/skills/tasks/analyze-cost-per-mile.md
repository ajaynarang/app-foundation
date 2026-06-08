---
name: analyze-cost-per-mile
type: task
description: Analyze fuel cost per mile for the fleet
primaryAgent: fuel
triggers:
  - cost.*per.*mile
  - "cpm"
  - fuel.*cost
  - operating.*cost
maxSteps: 4
---

## Procedure: Cost Per Mile Analysis

1. Get fleet status and fuel data for the analysis period
2. Calculate: total fuel cost / total miles = fleet CPM
3. Break down by: equipment type, driver, loaded vs empty miles
4. Compare to targets (dry van: $0.55-0.70, reefer: $0.65-0.80) and identify outliers
