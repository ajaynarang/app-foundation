---
title: "How does SALLY optimize routes?"
documentType: faq
audience: prospect
category: route_planning
keywords:
  - route
  - optimization
  - tsp
  - vrp
  - stop sequence
  - hos
---

SALLY's route optimization engine is available on the Fleet plan ($49/truck/month) and above. It uses TSP (Traveling Salesman Problem) and VRP (Vehicle Routing Problem) algorithms to find the optimal stop sequence across all pickups and deliveries on a load, then simulates the entire route segment-by-segment checking HOS compliance at each point. When a driver will need their 30-minute break or 10-hour rest period, the engine automatically inserts rest stops at locations with truck parking. When the vehicle's fuel range will be exceeded, it finds the cheapest nearby fuel stations within a configurable detour distance. Dispatchers can set priorities — minimize time, minimize cost, or balance both — and the engine adapts accordingly. The result is a fully compliant, cost-optimized route plan generated in seconds, complete with ETAs for every stop including rest and fuel waypoints. Once a route is active, the continuous monitoring system watches for deviations and can trigger automatic re-optimization if traffic, weather, dock delays, or HOS changes make the current plan suboptimal. On the Haul plan, dispatchers manage routes and stops manually, which works well for straightforward point-to-point loads, but the automated optimization is the reason growing fleets upgrade to Fleet.
