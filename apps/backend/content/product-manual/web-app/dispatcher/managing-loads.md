---
title: "Managing Loads"
documentType: guide
audience: all
category: dispatcher
keywords: [loads, create load, assign driver, status, kanban, rate confirmation, tracking]
---

# Managing Loads

Loads are the core unit of work in SALLY. This guide covers creating, assigning, tracking, and managing loads through their full lifecycle.

## Creating a Load

1. Navigate to **Loads** in the sidebar.
2. Click **+ New Load** in the top-right corner. A sheet opens with the load creation form.
3. Fill in the required fields:
   - **Customer**: Select an existing customer or create one inline.
   - **Pickup stop**: Enter the pickup address, contact name, date, and time window.
   - **Delivery stop**: Enter the delivery address, contact name, date, and time window.
   - **Rate**: Enter the total rate for the load.
   - **Reference number**: Optional external reference (broker load number, PO, etc.).
4. To add additional stops, click **+ Add Stop** and specify the stop type (pickup or delivery).
5. Click **Create Load**. The load is created in Draft status.

## Assigning a Driver

1. Open the load detail sheet by clicking the load on the Kanban board or list.
2. In the **Driver** field, select a driver from the dropdown. The list shows available drivers with their current status.
3. Once a driver is assigned and the load is confirmed, update the status to **Dispatched**. The driver will see the load assignment on their mobile app.

## Load Status Lifecycle

- **Draft**: Load is being prepared. Not yet confirmed with the customer.
- **Booked**: Confirmed with the customer. Ready for dispatch.
- **Dispatched**: Assigned to a driver. Driver has been notified.
- **In Transit**: Driver has departed the first pickup. Tracking is active.
- **Delivered**: Final delivery is confirmed. Ready for invoicing.

Update status from the load detail sheet by clicking the status badge, or drag the load card between Kanban columns.

## Importing from Rate Confirmation

> This feature requires the Fleet plan or higher.

1. Click **+ New Load** and then **Import Rate-Con** (or upload a PDF to Sally AI chat).
2. Upload the rate confirmation PDF. Sally AI extracts customer, stops, rates, dates, and reference numbers.
3. Review the extracted data — edit any fields that need correction.
4. Click **Create Load** to save.

## Additional Load Actions

- **Duplicate load**: From the load detail sheet, click the menu icon and select **Duplicate**. Useful for recurring shipments on the same lane.
- **Add notes**: Use the notes section on the load detail to communicate with your team. Notes are internal and not visible to customers.
- **Customer tracking link**: Every load automatically generates a tracking link. Share it with the customer so they can monitor delivery progress.

See also: [Billing & Invoicing](/docs/manual/web-app/dispatcher/billing-invoicing) | [Route Planning](/docs/manual/web-app/dispatcher/route-planning) | [Documents](/docs/manual/web-app/dispatcher/documents)
