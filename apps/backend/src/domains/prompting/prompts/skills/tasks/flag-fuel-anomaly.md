---
name: flag-fuel-anomaly
type: task
description: Investigate suspicious fuel transactions
primaryAgent: fuel
triggers:
  - fuel.*fraud
  - suspicious.*fuel
  - fuel.*theft
  - unusual.*purchase
maxSteps: 6
---

## Procedure: Flag Fuel Anomaly

1. Get the suspicious transaction details
2. Cross-reference: driver's route at time of purchase, GPS location, fuel capacity
3. Check patterns: frequency of purchases, average fill volume, typical locations
4. Classify: likely legitimate, suspicious, or confirmed anomaly
5. If suspicious, recommend: driver interview, card freeze, detailed audit
6. Document findings for fleet manager review
