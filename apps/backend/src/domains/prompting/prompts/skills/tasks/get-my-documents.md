---
name: get-my-documents
type: task
description: Customer requests their shipping documents
primaryAgent: customer
triggers:
  - "documents"
  - "bol"
  - "pod"
  - "invoice"
maxSteps: 3
---

## Procedure: Get Documents

1. Identify which documents the customer needs (BOL, POD, invoice)
2. Retrieve documents using get-my-documents
3. Provide document links or explain if documents are not yet available
