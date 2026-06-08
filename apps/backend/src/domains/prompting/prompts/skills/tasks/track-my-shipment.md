---
name: track-my-shipment
type: task
description: Customer tracks their shipment status
primaryAgent: customer
triggers:
  - where.*shipment
  - "tracking"
  - "eta"
  - "status"
maxSteps: 3
---

## Procedure: Track Shipment

1. Query customer's shipments using query-my-shipments
2. Get detail for the relevant shipment using get-shipment-detail
3. Provide: current status, location (city/state level), estimated arrival time
