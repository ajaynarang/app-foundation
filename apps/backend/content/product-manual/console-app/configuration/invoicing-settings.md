---
title: "Invoicing Settings"
documentType: guide
audience: all
category: console
keywords: [invoicing, settings, branding, logo, payment terms, email template, invoice number]
---

# Invoicing Settings

Invoicing settings control the appearance, numbering, and delivery of your invoices. All plans have access to these settings.

## Accessing Invoicing Settings

Navigate to **Console → Configuration → Invoicing**.

## Company Branding

- **Company logo**: Upload your logo to appear in the invoice header. This is the same logo used across SALLY (invoices, customer portal, emails). Supported formats: PNG, JPG, SVG.
- **Company name and address**: Displayed in the invoice header. These pull from your organization settings but can be previewed here.

## Payment Terms

- **Default net days**: The number of days after invoice date by which payment is due (e.g., Net 30). This default is applied to all new invoices but can be overridden on individual invoices.
- **Late payment terms**: Optional text describing late payment policies or interest charges. Appears on the invoice footer.

## Email Templates

Customize the email sent when you send an invoice to a customer:

- **Subject line**: The email subject (e.g., "Invoice #{invoiceNumber} from {companyName}").
- **Body text**: The email body. Use merge fields for dynamic content: `{customerName}`, `{invoiceNumber}`, `{invoiceAmount}`, `{dueDate}`, `{companyName}`.
- **Reply-to address**: The email address customers should reply to with questions about their invoice.

Preview the email template before saving to verify formatting and merge fields render correctly.

## Invoice Numbering

- **Auto-increment format**: Define the invoice number format (e.g., "INV-{number}" where {number} auto-increments). The next number in the sequence is shown for reference.
- **Starting number**: Set the starting invoice number if you want to continue from a previous system's numbering.

## Saving Changes

Click **Save** to apply changes. New settings take effect on all invoices generated after the save. Existing invoices are not retroactively updated.

See also: [Billing & Invoicing](/docs/manual/web-app/dispatcher/billing-invoicing) | [Organization Settings](/docs/manual/console-app/team-account/organization)
