---
name: review-csa-score
type: task
description: Review and analyze CSA/BASIC scores
primaryAgent: safety
triggers:
  - csa.*score
  - basic.*score
  - safety.*score
  - inspection.*result
crossDomainAgents:
  - compliance
maxSteps: 6
---

## Procedure: Review CSA Score

1. Get Shield score to see current CSA metrics using get-shield-score
2. Identify which BASICs are above alert thresholds
3. Get recent findings using get-shield-findings
4. For high-risk BASICs, identify contributing violations
5. Delegate to compliance: check if any violations are challengeable via DataQ
6. Recommend corrective actions by priority
