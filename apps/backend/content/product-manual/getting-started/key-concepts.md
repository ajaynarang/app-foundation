---
title: "Key Concepts"
documentType: guide
audience: all
category: getting_started
keywords: [concepts, tenants, roles, loads, stops, HOS, settlements, invoices, lifecycle]
---

# Key Concepts

Before diving into SALLY's features, familiarize yourself with these core concepts that appear throughout the platform.

## Tenants

A tenant is your company's isolated workspace in SALLY. All your data — drivers, vehicles, loads, invoices, settings — lives within your tenant. No other organization can see or access your data. Each tenant has its own configuration, integrations, and user roster.

## Roles

Every user in SALLY has a role that determines what they can see and do:

- **Dispatcher**: Full access to load management, fleet, billing, pay, close-out, alerts, command center, Shield, route planning, and Sally AI with fleet management tools.
- **Driver**: Access to their assigned loads, route details, messages, alerts, and Sally AI with route and HOS tools. Cannot see other drivers' data or financial details.
- **Admin**: Everything a dispatcher can do, plus organization settings, user management, and the setup hub.
- **Owner**: Everything an admin can do, plus full financial oversight and billing management.
- **Customer**: Portal access only — can view their shipments, track deliveries, download documents, and view invoices. No access to fleet operations.

See also: [Roles & Permissions Reference](/docs/manual/reference/roles-permissions)

## Loads

A load is the fundamental unit of work in SALLY. It represents a shipment that needs to move from origin to destination.

**Load lifecycle**: Draft → Booked → Dispatched → In Transit → Delivered. Each status transition reflects a real-world event — a load is booked when confirmed with the customer, dispatched when assigned to a driver, in transit when the driver departs the first pickup, and delivered when the final delivery is confirmed.

Every load has a customer, one or more stops (pickups and deliveries), a rate, and optionally a reference number, equipment requirements, and notes.

## Stops

Stops are the locations on a load or route. Each stop has a type (pickup, delivery, rest, or fuel), an address, and a time window (earliest and latest arrival). Stops drive the route plan — SALLY sequences and optimizes stops to minimize cost or time while respecting time windows and HOS constraints.

## Hours of Service (HOS)

Federal regulations limit how long commercial drivers can operate:

- **11-hour driving limit**: Maximum driving time after 10 consecutive hours off duty.
- **14-hour window**: All driving must occur within 14 hours of coming on duty.
- **30-minute break**: Required after 8 cumulative hours of driving.
- **70-hour cycle**: Maximum on-duty hours in an 8-day rolling period.

SALLY tracks HOS status (when connected to Samsara via the Fleet plan), validates route plans against HOS limits, inserts mandatory rest stops, and alerts dispatchers when drivers approach their limits.

## Settlements

A settlement is the calculation of driver pay for a defined period. SALLY computes gross pay from completed loads based on the driver's pay structure (per mile, percentage, flat rate, or custom), applies deductions (advances, fuel card charges, insurance), and produces a net pay amount for payroll processing.

## Invoices

An invoice is the bill sent to a customer for a completed load. SALLY auto-populates invoice line items from the load's rate and charges (fuel surcharge, detention, lumper fees). Invoices follow a lifecycle: Draft → Pending → Sent → Paid (or Overdue). Payments are recorded when received, and the close-out process ensures every delivered load has a corresponding invoice.

See also: [Managing Loads](/docs/manual/web-app/dispatcher/managing-loads) | [Billing & Invoicing](/docs/manual/web-app/dispatcher/billing-invoicing)
