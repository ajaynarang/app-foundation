---
title: "Document Intelligence"
documentType: guide
audience: all
category: sally_ai
keywords: [document intelligence, rate confirmation, PDF, extract, OCR, AI, auto-create load]
---

# Document Intelligence

> This feature requires the Fleet plan or higher.

Document intelligence uses Sally AI to automatically read and extract structured data from uploaded PDFs — primarily rate confirmations. Instead of manually entering load details from a rate-con, Sally reads the document and populates the fields for you.

## How It Works

1. **Upload a rate confirmation PDF** using one of these methods:
   - Open Sally chat and drag-and-drop the PDF, or click the attachment icon to upload.
   - Navigate to a load's Documents section and upload the file as a Rate Confirmation.
   - Click **+ New Load → Import Rate-Con** and select the file.

2. **Sally extracts the data**. The AI reads the PDF and identifies:
   - **Customer name**: The shipper or broker on the rate confirmation.
   - **Pickup stops**: Addresses, facility names, dates, and time windows.
   - **Delivery stops**: Addresses, facility names, dates, and time windows.
   - **Rates**: Total rate and any itemized charges.
   - **Reference numbers**: Broker load number, PO number, or other identifiers.
   - **Equipment requirements**: Trailer type, temperature requirements, or special handling.

3. **Review the extracted data**. Sally presents the extracted fields in a structured form. Review each field for accuracy — edit anything that was misread or needs adjustment. Common items to verify:
   - Addresses (especially suite numbers and zip codes)
   - Date formats
   - Rate amounts (particularly when the PDF has multiple rate tables)

4. **Create the load**. Click **Create Load** to generate a draft load with all the extracted data pre-filled. The load is created in Draft status, ready for final review and dispatch.

## Accuracy and Limitations

Document intelligence handles most standard rate confirmation formats with high accuracy. Factors that affect accuracy:

- **Clear, digital PDFs** produce the best results. Scanned documents with poor resolution may have lower accuracy.
- **Standard layouts** (common broker rate-con templates) are recognized reliably.
- **Unusual formats** or heavily formatted documents may require more manual correction.

Always review extracted data before creating the load. Sally highlights fields where she has lower confidence.

## Time Savings

For operations processing multiple rate confirmations daily, document intelligence eliminates the repetitive manual data entry that is both time-consuming and error-prone. A rate-con that takes 3-5 minutes to enter manually can be processed in under 30 seconds with review.

See also: [Managing Loads](/docs/manual/web-app/dispatcher/managing-loads) | [Documents](/docs/manual/web-app/dispatcher/documents) | [What is Sally](/docs/manual/sally-ai/what-is-sally)
