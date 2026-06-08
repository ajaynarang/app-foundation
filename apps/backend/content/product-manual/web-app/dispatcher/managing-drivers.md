---
title: "Managing Drivers"
documentType: guide
audience: all
category: dispatcher
keywords: [drivers, add driver, CDL, fleet, driver status, HOS, assign vehicle]
---

# Managing Drivers

The Drivers section lets you manage your driver roster, track their status, and view their operational history.

## Viewing Drivers

Navigate to **Fleet → Drivers** tab. The driver list shows each driver's name, status, assigned vehicle, current load (if any), and CDL expiry date. Use the search bar to find drivers by name or filter by status.

## Adding a Driver

1. Click **+ New Driver** in the top-right corner.
2. Fill in the required fields:
   - **Name**: Driver's full legal name.
   - **Email**: Used for login and notifications.
   - **Phone**: Mobile number for OTP authentication and communication.
   - **CDL number**: Commercial driver's license number.
   - **CDL expiry**: License expiration date. SALLY alerts you before expiry.
   - **Medical card expiry**: DOT medical certificate expiration date.
3. Optionally, assign a vehicle from the **Vehicle** dropdown (shows available vehicles).
4. Click **Create Driver**.

The driver receives an invitation to set up their SALLY account and access the driver mobile app.

## Driver Statuses

- **Active**: Available for load assignments and currently part of the active fleet.
- **Inactive**: Temporarily unavailable (e.g., personal leave, training). Cannot be assigned loads.
- **On Leave**: Extended absence. Removed from the available driver pool.

Change status from the driver detail sheet by clicking the status badge.

## Driver Detail View

Click any driver to open their detail sheet. From here you can:

- **Edit profile**: Update contact information, CDL details, and medical card expiry.
- **View current load**: See the driver's active assignment, if any.
- **HOS status**: View remaining drive time, on-duty time, and break status. Requires Fleet plan with Samsara connected.
- **Settlement history**: Review past pay periods and settlement amounts.
- **Assign or change vehicle**: Select from available vehicles.

## HOS Monitoring

> This feature requires the Fleet plan or higher with Samsara integration.

When Samsara is connected, SALLY displays real-time HOS data for each driver: remaining drive hours, duty window, break timer, and cycle hours. This data feeds into route planning validation and the alert system.

See also: [Managing Vehicles](/docs/manual/web-app/dispatcher/managing-vehicles) | [Driver Pay & Settlements](/docs/manual/web-app/dispatcher/driver-pay-settlements) | [Samsara Setup](/docs/manual/console-app/integrations/samsara-setup)
