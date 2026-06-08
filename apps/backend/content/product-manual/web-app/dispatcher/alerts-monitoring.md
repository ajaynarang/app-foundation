---
title: "Alerts and Monitoring"
documentType: guide
audience: all
category: dispatcher
keywords: [alerts, monitoring, HOS, compliance, dock delay, geofence, notifications]
---

# Alerts and Monitoring

> This feature requires the Fleet plan or higher.

SALLY's monitoring system runs continuously, evaluating 14 trigger types across your fleet and generating alerts when issues arise. Alerts help you stay ahead of problems before they impact delivery timelines or compliance.

## Viewing Alerts

Navigate to **Alerts** in the sidebar. The alerts page displays all active alerts organized by priority:

- **Critical**: Immediate action required (e.g., HOS violation, major compliance issue).
- **High**: Urgent attention needed (e.g., HOS approaching limit, significant delay).
- **Medium**: Should be addressed soon (e.g., dock delay, maintenance approaching).
- **Low**: Informational (e.g., weather advisory, minor schedule variance).

Use filters to narrow by alert type, priority, driver, or date range.

## Alert Types

SALLY monitors for the following conditions:

- **HOS approaching limit**: Driver nearing 11-hour driving or 14-hour duty limit.
- **Driver not moving**: Vehicle stationary for an unusual duration during an active route.
- **Dock delay**: Driver waiting at a pickup or delivery beyond the expected dock time.
- **Off-route deviation**: Driver has departed from the planned route.
- **Speeding**: Vehicle exceeding posted speed limits.
- **Geofence breach**: Vehicle entering or leaving a defined geographic area.
- **Weather advisory**: Severe weather along the planned route.
- **Traffic delay**: Significant traffic congestion affecting ETA.
- **Maintenance due**: Vehicle approaching a scheduled maintenance milestone.
- **CDL/medical card expiring**: Driver credentials approaching expiration.
- Additional trigger types for compliance and operational conditions.

## Managing Alerts

### Acknowledging an Alert

1. Click the alert to open its detail view.
2. Click **Acknowledge**. This signals to your team that someone is handling the issue. The alert moves from "New" to "Acknowledged" status.

### Resolving an Alert

1. From the alert detail view, add a **resolution note** describing the action taken.
2. Click **Resolve**. The alert moves to "Resolved" status and is removed from the active list.

## Configuring Alert Settings

Customize alert thresholds and notification preferences in **Console → Configuration → Alerts**. You can adjust when alerts fire (e.g., alert when HOS has 2 hours remaining vs. 1 hour) and which notification channels are used (in-app, email, push).

See also: [Alert Settings](/docs/manual/console-app/configuration/alert-settings) | [Command Center](/docs/manual/web-app/dispatcher/command-center) | [Shield Compliance](/docs/manual/web-app/dispatcher/shield-compliance)
