---
title: "QuickBooks Integration Setup"
documentType: guide
audience: all
category: console
keywords: [quickbooks, integration, accounting, invoices, payments, OAuth, sync]
---

# QuickBooks Integration Setup

> This feature requires the Freight Force plan.

Connecting QuickBooks to SALLY synchronizes your invoicing and payment data with your accounting system, eliminating double data entry and keeping your books current.

## Prerequisites

- A QuickBooks Online account with admin access.
- SALLY Freight Force plan.

## Connecting QuickBooks

1. Navigate to **Console → Integrations → Connections**.
2. Find **QuickBooks** in the available integrations list and click **Connect**.
3. Click **Authorize**. You are redirected to QuickBooks to log in and authorize SALLY.
4. Grant the requested permissions. SALLY requests access to create and read invoices, customers, and payment data.
5. After authorization, you are redirected back to SALLY Console. The integration status shows as **Connected**.

## What Syncs

- **Invoices (SALLY → QuickBooks)**: When you generate and send an invoice in SALLY, it is automatically pushed to QuickBooks as a new invoice. Line items, amounts, customer, and due date are mapped.
- **Payment status (QuickBooks → SALLY)**: When a payment is recorded in QuickBooks against a synced invoice, the payment status pulls back to SALLY, updating the invoice to Paid.
- **Customers**: SALLY maps customers to QuickBooks customer records. During initial setup, you may need to map existing customers.

## Account Mapping

After connecting, navigate to the **Account Mapping** section:

1. Map SALLY revenue categories to your QuickBooks **chart of accounts** (e.g., freight revenue, fuel surcharge revenue, accessorial revenue).
2. Map payment accounts if needed.
3. Click **Save Mapping**.

Proper account mapping ensures invoices are categorized correctly in your QuickBooks reports.

## Disconnecting

To disconnect QuickBooks, navigate to Console → Integrations → Connections, click QuickBooks, and select **Disconnect**. Previously synced invoices remain in both systems but no further syncing occurs. You can reconnect at any time by repeating the authorization flow.

See also: [Sync Management](/docs/manual/console-app/integrations/sync-management) | [Billing & Invoicing](/docs/manual/web-app/dispatcher/billing-invoicing)
