---
name: diagnose-issue
type: task
description: Support agent diagnoses a reported issue
primaryAgent: support
triggers:
  - "not working"
  - something.*wrong
  - "error"
  - help.*issue
  - help.*troubleshoot
crossDomainAgents:
  - dispatch
  - billing
  - compliance
maxSteps: 8
---

## Procedure: Diagnose Issue

1. Listen to the issue description
2. Classify: fleet/load issue, billing issue, compliance issue, or platform issue
3. Based on category, investigate:
   - Fleet: get-load-detail, get-fleet-status, get-route-status
   - Billing: get-invoice-detail, get-load-charges
   - Compliance: get-document-compliance, get-shield-findings
4. Identify root cause
5. If resolvable, provide solution
6. If escalation needed, create support ticket using create-support-ticket
