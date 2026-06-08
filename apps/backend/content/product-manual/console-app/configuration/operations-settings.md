---
title: "Operations Settings"
documentType: guide
audience: all
category: console
keywords: [operations, settings, HOS, optimization, fuel, compliance, configuration]
---

# Operations Settings

Operations settings define the default parameters SALLY uses for route planning, HOS validation, fuel management, and compliance monitoring. Changes here affect all route plans and monitoring across your fleet.

## Accessing Operations Settings

Navigate to **Console → Configuration → Operations**.

## HOS Rules

Configure the hours-of-service rules applied to your fleet:

- **Maximum driving time**: The daily driving limit (default: 11 hours per FMCSA regulations).
- **Maximum duty window**: The on-duty window after which no driving is permitted (default: 14 hours).
- **Required break**: Minimum break duration after cumulative driving hours (default: 30 minutes after 8 hours).
- **Cycle limit**: Maximum on-duty hours in a rolling period (default: 70 hours in 8 days).
- **Minimum rest period**: Required off-duty time before a new driving window (default: 10 consecutive hours).

These values are pre-set to federal FMCSA standards. Adjust them only if your operation follows different rules (e.g., short-haul exemptions or state-specific regulations).

## Optimization Settings

Set default preferences for route optimization:

- **Default priority**: Choose between minimize time, minimize cost, or balance as the default when creating new route plans.
- **Toll avoidance**: Preference for avoiding toll roads (never, when practical, always).
- **Maximum fuel detour distance**: How far off-route SALLY will route a driver to reach a cheaper fuel stop (e.g., 5 miles).

## Fuel Preferences

- **Default fuel type**: The primary fuel type for your fleet (diesel, gasoline, etc.). Used for fuel cost calculations and fuel stop selection.
- **Minimum fuel threshold**: The fuel level percentage at which SALLY inserts a fuel stop into route plans (e.g., 25%).

## Compliance Settings

- **Enable compliance checks**: Toggle whether Shield compliance monitoring is active.
- **CDL expiry warning**: Number of days before CDL expiration to generate an alert (default: 30 days).
- **Medical card expiry warning**: Number of days before medical card expiration to generate an alert (default: 30 days).

## Saving Changes

Click **Save** after making changes. New settings apply to all future route plans and monitoring evaluations. Existing dispatched routes are not retroactively changed.

See also: [Route Planning](/docs/manual/web-app/dispatcher/route-planning) | [Alert Settings](/docs/manual/console-app/configuration/alert-settings) | [Shield Compliance](/docs/manual/web-app/dispatcher/shield-compliance)
