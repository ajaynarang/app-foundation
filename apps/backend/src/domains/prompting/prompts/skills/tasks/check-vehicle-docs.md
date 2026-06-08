---
name: check-vehicle-docs
type: task
description: Verify vehicle documentation and inspection status
primaryAgent: compliance
triggers:
  - inspection.*due
  - registration.*expir
maxSteps: 4
---

## Procedure: Check Vehicle Documents

1. Get vehicle detail using get-vehicle-detail
2. Get document compliance for the vehicle using get-document-compliance
3. Check: annual DOT inspection date, registration, insurance, permits
4. Report: which documents are current, upcoming expirations, overdue items
