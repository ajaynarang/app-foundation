---
name: run-settlement-cycle
type: task
description: Process weekly driver settlements
primaryAgent: payroll
triggers:
  - "run settlement"
  - "pay drivers"
  - "payroll"
crossDomainAgents:
  - billing
maxSteps: 8
---

## Procedure: Run Settlement Cycle

1. Get settlement summary using get-settlement-summary for the current period
2. Review each driver's settlement: loads completed, gross pay, deductions
3. Delegate to billing: verify all included loads are invoiced
4. Flag any discrepancies: loads without charges, unusual deductions
5. Present summary for approval: total payout, per-driver breakdown
6. Approve settlements using approve-settlement (each requires confirmation)
7. Report: X settlements approved, total payout amount
