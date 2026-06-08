---
name: check-driver-quals
type: task
description: Verify driver qualification documents
primaryAgent: compliance
triggers:
  - "cdl expir"
  - "medical card"
  - driver.*qualified
maxSteps: 4
---

## Procedure: Check Driver Qualifications

1. Get driver detail using get-driver-detail
2. Get document compliance for the driver using get-document-compliance
3. Check each required document: CDL, medical cert, MVR, drug test, road test cert
4. Report: which documents are current, which expire soon, which are missing
