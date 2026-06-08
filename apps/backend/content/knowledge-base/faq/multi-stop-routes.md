---
title: "Can SALLY handle multi-stop routes?"
documentType: faq
audience: prospect
category: route_planning
keywords:
  - multi-stop
  - route
  - tsp
  - vrp
  - sequence optimization
---

Yes, multi-stop route optimization is one of SALLY's strongest capabilities, available on the Fleet plan ($49/truck/month) and above. Create loads with multiple pickup and delivery stops right in the platform, and SALLY's route planner evaluates all possible stop orderings using TSP (Traveling Salesman Problem) and VRP (Vehicle Routing Problem) algorithms to find the sequence with the shortest total time while maintaining full HOS compliance. The engine respects time windows at each stop — if a delivery has a 2pm appointment, SALLY ensures the sequence gets the driver there on time while still optimizing the rest of the route. Once the optimal sequence is determined, the system automatically inserts rest stops where HOS rules require them and fuel stops where the vehicle's range demands them, producing a complete plan with ETAs for every stop. Dispatchers can override the suggested sequence if business priorities require it, and SALLY will re-optimize around those constraints. On the Haul plan, dispatchers create loads and manage stops manually, which works well for simpler operations, but the automated optimization and sequencing is what makes Fleet the most popular plan for growing fleets.
