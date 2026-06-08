---
name: reconcile-fuel-cards
type: task
description: Reconcile fuel card transactions against routes
primaryAgent: fuel
triggers:
  - fuel.*card
  - fuel.*reconcil
  - fuel.*transaction
  - "comdata"
  - "efs"
maxSteps: 6
---

## Procedure: Reconcile Fuel Cards

1. Get fleet status for the reconciliation period
2. For each driver, compare fuel purchases vs assigned routes
3. Flag anomalies: location mismatch (>50mi from route), volume > tank capacity, off-duty purchases, duplicates
4. Calculate total fuel spend vs budgeted amount
5. Present findings: clean transactions, flagged transactions, total variance
6. Recommend investigation for flagged transactions
