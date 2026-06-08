---
name: check-my-invoices
type: task
description: Customer checks their invoice status
primaryAgent: customer
triggers:
  - "invoice"
  - "bill"
  - "payment"
  - "balance"
maxSteps: 3
---

## Procedure: Check Invoices

1. Get customer's invoices using get-my-invoices
2. Show: open invoices, amounts, due dates, payment status
3. If payment questions, explain payment methods and terms
