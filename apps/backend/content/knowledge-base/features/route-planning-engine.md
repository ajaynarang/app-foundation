---
title: "Route Planning Engine"
documentType: feature
audience: prospect
category: route_planning
keywords:
  - route planning
  - engine
  - optimization
  - tsp
  - vrp
  - core feature
---

SALLY's route planning engine is the AI-powered core of the operations suite, and it is the reason most fleets upgrade to Fleet or above. Available on Fleet ($49/truck/month) and Freight Force plans, the engine takes the manual guesswork out of dispatch by producing fully optimized, HOS-compliant route plans in seconds. Select one or more loads from your Kanban board, assign a driver and vehicle, choose your optimization priority (minimize time, minimize cost, or balanced), and SALLY handles the rest.

Under the hood, the engine solves Traveling Salesman and Vehicle Routing Problems to find the optimal stop sequence across multi-stop loads. It then runs a full HOS simulation against every segment of the route, checking the 11-hour driving limit, 14-hour duty window, 30-minute break rule, and 70-hour weekly cycle. When the simulation detects that a driver will approach any limit, SALLY automatically inserts rest stops — choosing between a full 10-hour rest, split sleeper berth, or dock-time conversion depending on what the schedule allows. Fuel stops are placed at the cheapest stations within a configurable detour radius, using each vehicle's actual tank capacity and MPG to calculate range precisely.

Every plan includes a segment-by-segment timeline showing drive time, dock time, rest periods, and fuel stops with ETAs, distances, projected costs, and HOS state at each point. Dispatchers can configure preferences like toll road avoidance, maximum fuel detour miles, and preferred rest types. The plan detail view explains SALLY's optimization decisions in plain language — why each rest stop was chosen, which fuel stations were selected and why, and how the stop sequence was reordered for efficiency. Once a plan goes active, it feeds directly into SALLY's continuous monitoring system, which watches the route around the clock and re-plans automatically if conditions change.
