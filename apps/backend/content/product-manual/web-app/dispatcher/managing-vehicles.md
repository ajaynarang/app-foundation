---
title: "Managing Vehicles"
documentType: guide
audience: all
category: dispatcher
keywords: [vehicles, add vehicle, fleet, VIN, telematics, Samsara, mileage]
---

# Managing Vehicles

The Vehicles section lets you maintain your fleet inventory, track vehicle details, and monitor telematics data.

## Viewing Vehicles

Navigate to **Fleet → Vehicles** tab. The vehicle list shows each vehicle's unit number, make/model, assigned driver, status, and mileage. Search by unit number or filter by status.

## Adding a Vehicle

1. Click **+ New Vehicle** in the top-right corner.
2. Fill in the vehicle details:
   - **Unit number**: Your internal fleet identifier.
   - **Make and Model**: Vehicle manufacturer and model (e.g., Freightliner Cascadia).
   - **Year**: Model year.
   - **VIN**: Vehicle Identification Number.
   - **Fuel type**: Diesel, gasoline, electric, or other.
   - **License plate**: Plate number and state.
3. Optionally, assign a driver from the **Driver** dropdown.
4. Click **Create Vehicle**.

## Vehicle Details

Click any vehicle to open its detail sheet:

- **Edit details**: Update unit number, VIN, license plate, and other fields.
- **Assigned driver**: View or change the current driver assignment.
- **Mileage**: Current odometer reading. Updated automatically when Samsara is connected.
- **Telematics data**: GPS position, engine status, fuel level, and diagnostic codes. Requires Fleet plan with Samsara.

## Telematics Integration

> This feature requires the Fleet plan or higher with Samsara integration.

When Samsara is connected, vehicle data syncs automatically. SALLY pulls GPS positions, engine hours, fuel levels, odometer readings, and diagnostic fault codes. This data powers the fleet map in the command center and feeds into maintenance alerts.

See also: [Managing Drivers](/docs/manual/web-app/dispatcher/managing-drivers) | [Samsara Setup](/docs/manual/console-app/integrations/samsara-setup)
