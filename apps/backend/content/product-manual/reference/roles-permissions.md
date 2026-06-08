---
title: "Roles and Permissions"
documentType: reference
audience: all
category: reference
keywords: [roles, permissions, access, dispatcher, driver, admin, owner, customer, super admin]
---

# Roles and Permissions

Every user in SALLY is assigned a role that determines their access level. This reference lists each role and its permissions.

## Role Access Matrix

| Area | Dispatcher | Driver | Admin | Owner | Customer |
|------|-----------|--------|-------|-------|----------|
| Loads (view/manage) | Yes | Own only | Yes | Yes | Own only |
| Fleet (drivers/vehicles) | Yes | No | Yes | Yes | No |
| Customers | Yes | No | Yes | Yes | No |
| Billing & Invoicing | Yes | No | Yes | Yes | View own |
| Driver Pay & Settlements | Yes | Own only | Yes | Yes | No |
| Close Out | Yes | No | Yes | Yes | No |
| Route Planning | Yes | View own | Yes | Yes | No |
| Alerts | Yes | Own only | Yes | Yes | No |
| Command Center | Yes | No | Yes | Yes | No |
| Shield Compliance | Yes | No | Yes | Yes | No |
| Documents | Yes | Own loads | Yes | Yes | Own loads |
| Sally AI (chat) | Yes | Yes | Yes | Yes | Limited |
| Sally AI (actions) | Yes | Limited | Yes | Yes | No |
| Settings | No | No | Yes | Yes | No |
| User Management | No | No | Yes | Yes | No |
| Console (full) | No | No | Yes | Yes | No |
| Financial Oversight | No | No | No | Yes | No |

## Role Descriptions

### Dispatcher
The primary operational role. Dispatchers manage the day-to-day workflow: creating and assigning loads, monitoring the fleet, generating invoices, processing settlements, handling alerts, and using the command center. Dispatchers have Sally AI with full fleet management tools.

### Driver
Drivers access the mobile-optimized view. They see their current load assignment, route with stop details, HOS status, messages from dispatch, and alerts relevant to them. Drivers interact with Sally AI for route and HOS queries and basic status updates. Drivers cannot view other drivers' data, financial details, or fleet-wide information.

### Admin
Admins have everything a dispatcher has, plus organization settings, user management, and the setup hub. Admins can invite and manage team members, configure tenant settings, and access Console for configuration and integrations.

### Owner
Owners have everything an admin has, plus financial oversight. This includes full visibility into profitability, margins, and financial reporting. The Owner role is typically assigned to the business owner or controller.

### Customer
Customers access only the customer portal. They can view their shipments, track deliveries, download documents (BOL, POD), and view their invoices. Customers cannot see any fleet operations, driver information, or other customers' data. Sally AI for customers is limited to shipment status queries.

### Super Admin
Super Admin is a platform-level role managed by the SALLY team. Super Admins have access to all tenants and platform-wide management tools. This role is not assignable by tenant admins.

See also: [User Management](/docs/manual/web-app/admin/user-management) | [Key Concepts](/docs/manual/getting-started/key-concepts)
