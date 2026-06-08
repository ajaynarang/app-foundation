---
title: "Route Planning"
documentType: guide
audience: all
category: dispatcher
keywords: [route planning, optimization, HOS, rest stops, fuel stops, TSP, VRP, dispatch]
---

# Route Planning

> This feature requires the Fleet plan or higher.

Route planning lets you build optimized, HOS-compliant routes for your drivers. SALLY sequences stops, validates hours of service, inserts rest and fuel stops, and calculates accurate ETAs and costs.

## Creating a Route Plan

1. Navigate to **Plans** in the sidebar.
2. Click **+ New Plan** in the top-right corner.
3. Select a **driver** and **vehicle** for the route.
4. Add loads to the route:
   - Search for loads by reference number or customer name, or
   - Drag loads from the available load board into the route.
5. Set the **optimization priority**:
   - **Minimize time**: Shortest total route duration.
   - **Minimize cost**: Lowest fuel and toll costs, even if the route takes longer.
   - **Balance**: A weighted combination of time and cost.
6. Click **Optimize**. SALLY runs the optimization algorithm (TSP/VRP), sequences stops, validates HOS compliance, and builds the full route.

## Reviewing the Route

After optimization, SALLY presents a detailed route plan:

- **Segment-by-segment timeline**: Each segment shows the type (drive, dock, rest, fuel), start/end times, distance, and duration.
- **HOS state tracking**: The plan shows the driver's projected HOS state at each point — remaining drive hours, duty window, break timer, and cycle hours.
- **Rest stops**: Automatically inserted when HOS limits require a break or 10-hour reset.
- **Fuel stops**: Inserted at the cheapest fuel stations along the route when the projected fuel level drops below the threshold.
- **ETAs**: Estimated arrival times at each stop, accounting for drive time, dock time, rest, and traffic.
- **Cost breakdown**: Fuel cost, toll cost, and total estimated cost for the route.

Review each segment and make adjustments if needed. You can reorder stops manually or lock specific stop sequences before re-optimizing.

## Dispatching the Route

1. Once you are satisfied with the route plan, click **Dispatch**.
2. The route is assigned to the driver. Their mobile app updates with the full route, stop list, and turn-by-turn guidance.
3. Associated loads are automatically moved to Dispatched status.

## Monitoring Progress

After dispatch, monitor the route from the **Command Center**. The fleet map shows the driver's real-time position along the route. SALLY tracks actual vs. planned progress and generates alerts for delays, off-route deviations, and HOS issues.

See also: [Command Center](/docs/manual/web-app/dispatcher/command-center) | [Alerts & Monitoring](/docs/manual/web-app/dispatcher/alerts-monitoring) | [Operations Settings](/docs/manual/console-app/configuration/operations-settings)
