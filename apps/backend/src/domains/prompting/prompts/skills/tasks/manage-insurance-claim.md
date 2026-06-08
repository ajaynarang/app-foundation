---
name: manage-insurance-claim
type: task
description: Track and manage an insurance claim
primaryAgent: safety
triggers:
  - insurance.*claim
  - file.*claim
  - "adjuster"
  - "subrogation"
crossDomainAgents:
  - billing
maxSteps: 6
---

## Procedure: Manage Insurance Claim

1. Get the incident details from user
2. Verify all documentation is gathered: police report, photos, ELD data, dash cam
3. Confirm insurance carrier has been notified
4. Track claim status: filed → adjuster assigned → investigation → resolution
5. If subrogation opportunity, document other party's liability
6. Delegate to billing: track claim impact on customer account if applicable
