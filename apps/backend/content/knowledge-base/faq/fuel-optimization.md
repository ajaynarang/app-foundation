---
title: "How does SALLY handle fuel optimization?"
documentType: faq
audience: prospect
category: fuel_optimization
keywords:
  - fuel
  - optimization
  - fuel stops
  - fuel prices
  - range
---

Fuel optimization is part of SALLY's route planning engine, available on the Fleet plan ($49/truck/month) and above. SALLY tracks each vehicle's fuel capacity and miles-per-gallon to calculate range, and when a route segment would consume more fuel than the tank allows, the system automatically finds nearby fuel stops and compares real-time prices to insert the cheapest option within a configurable detour distance. Dispatchers see projected fuel costs for the entire route before the driver departs, which helps with load profitability analysis and customer quoting. The fuel stop selection considers not just price but also truck accessibility, amenities, and how the stop fits into the overall route timing and HOS schedule — a slightly more expensive station that avoids a 15-mile detour might save more money in total operating cost. If conditions change mid-route and the driver burns fuel faster than expected due to weather or terrain, the continuous monitoring system can trigger a route re-plan that adjusts fuel stop placement accordingly. Fuel price data is pulled from real-time pricing APIs to keep cost estimates accurate.
