---
name: file-ifta-report
type: task
description: Prepare and file IFTA quarterly fuel tax report
primaryAgent: fuel
triggers:
  - "ifta"
  - fuel.*tax
  - quarterly.*tax
  - "jurisdiction"
maxSteps: 6
---

## Procedure: File IFTA Report

1. Identify the reporting quarter and deadline
2. Gather data: miles by jurisdiction (from ELD/GPS), fuel purchases by state (from fuel cards)
3. Calculate fleet MPG for the quarter
4. Calculate taxable gallons per jurisdiction: miles / MPG
5. Calculate net tax: taxable gallons - gallons purchased per jurisdiction × tax rate
6. Present summary: total tax owed/credit per state, filing deadline, any data gaps
