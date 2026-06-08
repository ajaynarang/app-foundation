---
name: audit-load-compliance
type: task
description: Check a load's compliance status
primaryAgent: compliance
triggers:
  - "compliance check"
  - audit.*load
  - shield.*score
maxSteps: 4
---

## Procedure: Audit Load

1. Get load details using get-load-detail
2. Get document compliance using get-document-compliance
3. Get Shield score/findings if available using get-shield-score
4. Report: documents status (complete/incomplete), compliance score, any findings
