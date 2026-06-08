---
name: handle-pay-dispute
type: task
description: Investigate and resolve driver pay disputes
primaryAgent: payroll
triggers:
  - pay.*wrong
  - missing.*pay
  - deduction.*wrong
maxSteps: 6
---

## Procedure: Handle Pay Dispute

1. Get the disputed settlement details using get-settlement-detail
2. Get driver's pay structure using get-driver-pay-structure
3. Recalculate pay based on actual loads and miles
4. Compare calculated vs paid amount
5. Identify discrepancy: wrong rate applied, missing load, incorrect deduction
6. Present findings and recommended correction
