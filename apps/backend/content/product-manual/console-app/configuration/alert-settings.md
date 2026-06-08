---
title: "Alert Settings"
documentType: guide
audience: all
category: console
keywords: [alerts, configuration, thresholds, notifications, escalation, channels]
---

# Alert Settings

> This feature requires the Fleet plan or higher.

Alert settings let you customize when alerts are triggered, how they are delivered, and what happens when they go unacknowledged.

## Accessing Alert Settings

Navigate to **Console → Configuration → Alerts**.

## Alert Thresholds

Each alert type has configurable thresholds that determine when it fires:

- **HOS approaching limit**: Set the remaining time that triggers a warning (e.g., alert when 2 hours of driving time remain, or 1 hour).
- **Dock delay**: Set the minutes past the scheduled dock time before a dock delay alert is generated (e.g., 30 minutes).
- **Speed limit tolerance**: Set the MPH over the posted limit that triggers a speeding alert (e.g., 5 MPH over).
- **Driver not moving**: Set the idle duration during an active route before an alert fires (e.g., 45 minutes).
- **Geofence breach**: Configure geofence zones and trigger on entry, exit, or both.

Adjust thresholds to match your operation's risk tolerance. Lower thresholds produce more alerts but catch issues earlier. Higher thresholds reduce alert noise but may surface issues later.

## Notification Channels

Configure how alerts are delivered to your team:

- **In-app**: Alerts appear in the Web App alerts page and command center ticker. Always enabled.
- **Email**: Send alert notifications to configured email addresses. Useful for off-hours monitoring.
- **Push notification**: Send push notifications to the SALLY mobile app. Critical for drivers and on-call dispatchers.

Set notification preferences per alert priority level. For example, send push notifications only for Critical and High alerts, while Medium and Low alerts are in-app only.

## Alert Grouping

Enable alert grouping to combine related alerts and reduce noise. When grouping is active, multiple alerts of the same type for the same driver or vehicle within a short time window are consolidated into a single alert with a count.

## Escalation Rules

Set up automatic escalation for unacknowledged alerts:

1. Define the escalation time: how long an alert can remain unacknowledged before escalating (e.g., 15 minutes for Critical, 30 minutes for High).
2. Define the escalation action: notify additional team members, increase priority, or send to a specific email address.

Escalation ensures that critical issues are never missed, even during shift changes or busy periods.

See also: [Alerts & Monitoring](/docs/manual/web-app/dispatcher/alerts-monitoring) | [Operations Settings](/docs/manual/console-app/configuration/operations-settings)
