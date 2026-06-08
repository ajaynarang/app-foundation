---
name: report-issue
type: task
description: Driver reports an issue on the road
primaryAgent: driver
triggers:
  - "problem"
  - "issue"
  - "breakdown"
  - "accident"
maxSteps: 4
---

## Procedure: Report Issue

1. Identify issue type: breakdown, accident, cargo damage, facility problem
2. If accident: immediately escalate to safety agent (emergency escalation)
3. If breakdown: get location, assess severity, report to dispatch
4. If other: document the issue and notify dispatch
