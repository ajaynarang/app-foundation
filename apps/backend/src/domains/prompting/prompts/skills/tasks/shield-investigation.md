---
name: shield-investigation
type: task
description: Investigate Shield compliance findings
primaryAgent: compliance
triggers:
  - shield.*finding
  - compliance.*issue
  - "violation"
maxSteps: 6
---

## Procedure: Shield Investigation

1. Get Shield findings using get-shield-findings
2. Get Shield score using get-shield-score
3. For each finding, get the relevant entity details (driver, vehicle, or load)
4. Assess severity: critical (immediate OOS risk), warning (upcoming expiry), info (recommendation)
5. Recommend actions for each finding
6. Trigger a fresh Shield audit if data may be stale using trigger-shield-audit
