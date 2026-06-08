---
name: emergency-escalation
type: task
description: Driver emergency escalation to safety agent
primaryAgent: driver
triggers:
  - "accident"
  - "crash"
  - "injury"
  - "fire"
  - hazmat.*spill
  - hit.*truck
  - hit.*vehicle
crossDomainAgents:
  - safety
maxSteps: 2
---

## Procedure: Emergency Escalation

This skill is triggered automatically by the driver agent when emergency keywords are detected.
The driver agent delegates to the safety agent with the handle-accident task skill.
No manual steps needed — the escalation is automatic.
