---
name: post-accident-protocol
type: task
description: Post-accident follow-up procedures
primaryAgent: safety
triggers:
  - "drug test"
  - post.*accident
  - return.*duty
  - "clearance"
crossDomainAgents:
  - compliance
maxSteps: 6
---

## Procedure: Post-Accident Protocol

1. Verify drug test was completed within 32 hours of accident
2. Check drug test results
3. Delegate to compliance: verify all FMCSA reporting requirements met
4. If reportable crash, confirm FMCSA crash report filed within 30 days
5. Verify driver has medical clearance for return to duty
6. Schedule safety debrief and any required retraining
