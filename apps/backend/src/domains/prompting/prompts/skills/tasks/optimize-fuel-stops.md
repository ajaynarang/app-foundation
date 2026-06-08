---
name: optimize-fuel-stops
type: task
description: Find cheapest fuel stops along a route
primaryAgent: route
triggers:
  - "fuel stop"
  - where.*fuel
  - "cheapest fuel"
maxSteps: 4
---

## Procedure: Optimize Fuel Stops

1. Get current route using get-route-status
2. Identify fuel stops within 10 miles of route
3. Compare prices at each stop, factoring in fleet discounts
4. Recommend top 2-3 stops with: name, location, price, distance from route
