---
title: "Billing and Invoicing"
documentType: guide
audience: all
category: dispatcher
keywords: [billing, invoicing, payments, factoring, line items, send invoice, void]
---

# Billing and Invoicing

SALLY handles the full invoicing lifecycle — from generating an invoice for a delivered load through payment collection and reconciliation.

## Viewing Invoices

Navigate to **Billing → Invoices**. The invoice list shows all invoices with their status, customer, amount, and date. Filter by status (Draft, Pending, Sent, Paid, Overdue, Voided) or search by invoice number, customer, or load reference.

## Generating an Invoice

1. Open a delivered load's detail sheet.
2. Click **Generate Invoice**. Alternatively, navigate to Billing → Invoices and click **+ New Invoice**, then select the load.
3. SALLY auto-populates the invoice with:
   - Load details (origin, destination, dates)
   - Line items based on the load's rate
   - Customer billing information
4. Review and edit line items as needed. Add additional charges:
   - **Fuel surcharge**: Percentage or flat amount added for fuel costs.
   - **Detention**: Charge for excessive wait time at pickup or delivery.
   - **Lumper**: Fee for loading or unloading services.
   - **Accessorial charges**: Any other charges agreed upon with the customer.
5. Click **Save** to create the invoice in Draft status, or **Save & Send** to generate and email it immediately.

## Sending an Invoice

1. Open the invoice detail sheet.
2. Click **Send**. The invoice is emailed to the customer's billing email address.
3. The status changes from Draft/Pending to **Sent**.

Customize the email template and company branding in **Console → Configuration → Invoicing**.

## Recording a Payment

1. Open the invoice detail sheet.
2. Click **Record Payment**.
3. Enter the payment amount, date, and method (check, ACH, wire, etc.).
4. Click **Save**. If the payment covers the full amount, the invoice status changes to **Paid**.

## Voiding an Invoice

If an invoice was created in error, open the invoice detail sheet and click **Void**. Voided invoices remain in the system for record-keeping but are excluded from financial summaries.

## Factoring an Invoice

Factoring lets you sell an invoice to a factoring company for immediate payment at a discount:

1. Open the invoice detail sheet.
2. Click **Factor Invoice**.
3. Confirm the factoring action. The invoice is marked as factored, and you receive payment from the factoring company rather than waiting for the customer.

## Invoice Status Lifecycle

Draft → Pending → Sent → Paid (or Overdue → Paid). Invoices not paid within the configured payment terms automatically move to Overdue status.

See also: [Close Out](/docs/manual/web-app/dispatcher/close-out) | [Managing Customers](/docs/manual/web-app/dispatcher/managing-customers) | [Invoicing Settings](/docs/manual/console-app/configuration/invoicing-settings)
