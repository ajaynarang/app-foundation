---
title: "Organization Settings"
documentType: guide
audience: all
category: console
keywords: [organization, company, DOT number, MC number, legal entity, address, settings]
---

# Organization Settings

Organization settings store your company's official details, used on invoices, compliance documents, and the customer portal.

## Accessing Organization Settings

Navigate to **Console → Account → Organization**. Only Admin and Owner roles can edit these settings.

## Company Details

- **Company name**: Your business's operating name. Displayed in the Web App header, invoices, and customer portal.
- **Legal entity name**: The registered legal name of your business, if different from the operating name. Used on formal documents.
- **Address**: Company mailing address. Appears on invoice headers and official correspondence.
- **Phone**: Main company phone number.
- **Timezone**: Organization-wide default timezone. Affects time display across the platform for users who have not set a personal timezone preference.

## Regulatory Information

- **DOT number**: Your Department of Transportation registration number. Required for FMCSA compliance documentation.
- **MC number**: Your Motor Carrier number issued by FMCSA. Used on rate confirmations and compliance documents.

These numbers appear on relevant documents and are checked during Shield compliance audits.

## How Organization Details Are Used

The information entered here propagates throughout SALLY:

- **Invoices**: Company name, legal name, address, and logo appear in the invoice header.
- **Customer portal**: Your company name and branding are displayed to customers.
- **Compliance documents**: DOT and MC numbers are included where required.
- **Email communications**: Company name appears in transactional emails sent to customers and team members.

## Saving Changes

Click **Save** after making updates. Changes propagate to new documents and communications immediately. Previously generated invoices and documents are not retroactively updated.

See also: [Tenant Settings](/docs/manual/web-app/admin/tenant-settings) | [Invoicing Settings](/docs/manual/console-app/configuration/invoicing-settings) | [Shield Compliance](/docs/manual/web-app/dispatcher/shield-compliance)
