---
title: "Samsara Integration Setup"
documentType: guide
audience: all
category: console
keywords: [samsara, integration, ELD, GPS, telematics, HOS, sync, API key]
---

# Samsara Integration Setup

> This feature requires the Fleet plan or higher.

Connecting Samsara to SALLY brings in real-time driver and vehicle data — GPS positions, HOS status, telematics, and ELD events — enabling the command center, route monitoring, and compliance features.

## Prerequisites

- A Samsara account with API access enabled.
- A Samsara API key with read permissions for drivers, vehicles, GPS, and HOS data.
- SALLY Fleet plan or higher.

## Connecting Samsara

1. Navigate to **Console → Integrations → Connections**.
2. Find **Samsara** in the available integrations list and click **Connect**.
3. Enter your **Samsara API key** in the provided field.
4. Click **Validate**. SALLY tests the connection by querying your Samsara account.
5. If validation succeeds, click **Save**. The integration is now active.

## What Syncs

Once connected, SALLY automatically syncs the following data from Samsara:

- **Drivers**: Names, license information, and status. Synced drivers appear in your Fleet → Drivers list.
- **Vehicles**: Unit numbers, VINs, and vehicle details. Synced vehicles appear in Fleet → Vehicles.
- **GPS positions**: Real-time location data for all vehicles. Powers the command center fleet map.
- **HOS data**: Current hours-of-service status for each driver — remaining drive time, duty window, break timer, and cycle hours.
- **ELD events**: Electronic logging device events used for HOS calculation and compliance verification.

## Sync Schedule

The initial sync runs immediately after connection and pulls all drivers, vehicles, and current data. Ongoing syncs run automatically at regular intervals. GPS positions update frequently (near real-time), while driver and vehicle records sync periodically.

## Viewing Sync Status

Navigate to **Console → Integrations → Sync** to monitor the Samsara integration:

- **Last sync time**: When the most recent sync completed.
- **Records synced**: Count of drivers, vehicles, and events synced.
- **Errors**: Any sync errors with details and suggested remediation.

## Disconnecting

To disconnect Samsara, navigate to Console → Integrations → Connections, click Samsara, and select **Disconnect**. Synced data remains in SALLY but will no longer update.

See also: [Sync Management](/docs/manual/console-app/integrations/sync-management) | [Command Center](/docs/manual/web-app/dispatcher/command-center) | [Managing Drivers](/docs/manual/web-app/dispatcher/managing-drivers)
