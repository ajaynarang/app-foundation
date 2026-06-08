---
name: calculate-driver-pay
type: task
description: Calculate what a driver earned or will earn
primaryAgent: payroll
triggers:
  - how much.*owe
  - "driver pay"
  - what.*earn
maxSteps: 4
---

## Procedure: Calculate Pay

1. Get driver's pay structure using get-driver-pay-structure
2. Get the relevant loads or settlement period
3. Calculate: gross pay based on structure (per-mile x miles, or % of gross, or flat rate)
4. Apply deductions and present: gross pay, deductions breakdown, net pay
