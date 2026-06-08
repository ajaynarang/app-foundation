---
name: batch-status-update
type: task
description: Update status for multiple loads at once
primaryAgent: dispatch
triggers:
  - "update all"
  - mark.*delivered
maxSteps: 6
---

## Procedure: Batch Status Update

1. Clarify which loads and what status change is needed
2. Query matching loads using query-loads with appropriate filters
3. Show the list: load numbers, current status, proposed new status
4. Get confirmation for the batch update
5. Update each load status individually using update-load-status (each requires confirmation)
6. Report results: X updated, Y skipped (with reasons)
