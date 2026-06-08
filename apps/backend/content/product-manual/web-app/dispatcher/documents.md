---
title: "Documents"
documentType: guide
audience: all
category: dispatcher
keywords: [documents, BOL, POD, rate confirmation, upload, document intelligence, compliance]
---

# Documents

SALLY tracks documents associated with loads, including bills of lading, proof of delivery, rate confirmations, and other shipping paperwork.

## Uploading Documents

1. Open a load's detail sheet.
2. Navigate to the **Documents** section.
3. Click **Upload** and select the file (PDF, image, or scan).
4. Select the **document type**: BOL (Bill of Lading), POD (Proof of Delivery), Rate Confirmation, or Other.
5. Click **Save**. The document is attached to the load and available for download by authorized users.

## Document Types

- **BOL (Bill of Lading)**: The shipping document confirming freight receipt at pickup. Typically signed by the driver and shipper.
- **POD (Proof of Delivery)**: Signed confirmation that freight was delivered successfully. Required for invoicing and close-out.
- **Rate Confirmation**: The contract between your carrier and the shipper/broker specifying rates, stops, and terms.
- **Other**: Any additional documentation (lumper receipts, inspection reports, photos, etc.).

## Document Intelligence

> This feature requires the Fleet plan or higher.

Document intelligence uses Sally AI to automatically extract data from uploaded PDFs:

1. Upload a rate confirmation PDF to a load or directly to Sally AI chat.
2. Sally AI reads the document and extracts: customer name, pickup and delivery stops with addresses and dates, rates, reference numbers, and equipment requirements.
3. Review the extracted data for accuracy — edit any fields that need correction.
4. Click **Create Load** to generate a draft load directly from the extracted data.

This capability saves significant time compared to manual data entry, especially for operations processing many rate confirmations daily.

## Document Compliance Tracking

> This feature requires the Fleet plan or higher.

Shield's compliance engine tracks document completeness across your fleet. It flags loads missing required documents (e.g., a delivered load without a POD) and drivers with expired or missing credentials. Document-related findings appear in the Shield dashboard and generate alerts for critical items.

See also: [Managing Loads](/docs/manual/web-app/dispatcher/managing-loads) | [Shield Compliance](/docs/manual/web-app/dispatcher/shield-compliance) | [Document Intelligence](/docs/manual/sally-ai/document-intelligence)
