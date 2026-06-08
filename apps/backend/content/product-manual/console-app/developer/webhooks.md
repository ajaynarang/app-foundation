---
title: "Webhooks"
documentType: guide
audience: all
category: console
keywords: [webhooks, events, developer, notifications, endpoint, delivery, retry]
---

# Webhooks

> This feature requires the Freight Force plan.

Webhooks let SALLY push real-time event notifications to your external systems. Instead of polling the API for changes, your application receives HTTP POST requests whenever events occur.

## Accessing Webhooks

Navigate to **Console → Developer → Webhooks**.

## Creating a Webhook Endpoint

1. Click **+ Create Endpoint**.
2. Enter the **URL** of your endpoint (e.g., `https://your-app.com/webhooks/sally`). The endpoint must accept POST requests and return a 2xx status code.
3. Select the **events** to subscribe to. Available events include:
   - `load.created` — A new load is created.
   - `load.updated` — A load's details or status changes.
   - `driver.status_changed` — A driver's status is updated.
   - `alert.created` — A new alert is generated.
   - `invoice.sent` — An invoice is sent to a customer.
   - `invoice.paid` — A payment is recorded on an invoice.
   - `settlement.approved` — A settlement is approved for payroll.
   - Additional events as documented in the API specification.
4. Click **Create**.

## Event Payload

Each webhook delivery includes a JSON payload with:

- **Event type**: The event name (e.g., `load.updated`).
- **Timestamp**: When the event occurred.
- **Data**: The full object that triggered the event (e.g., the complete load record).
- **Webhook ID**: A unique identifier for this delivery, useful for deduplication.

## Delivery Logs

Click any endpoint to view its delivery history. Each log entry shows:

- **Event type**: What triggered the delivery.
- **Status code**: The HTTP response code from your endpoint.
- **Response time**: How long your endpoint took to respond.
- **Timestamp**: When the delivery was attempted.

## Retry Policy

Failed deliveries (non-2xx response or timeout) are retried automatically:

- **3 retries** with exponential backoff (approximately 1 minute, 5 minutes, 30 minutes).
- If all retries fail, the delivery is marked as failed in the logs.
- Persistent failures may result in the endpoint being automatically disabled. Re-enable it from the webhook detail page after fixing the issue.

## Testing

Click **Send Test Event** on any endpoint to deliver a sample event payload. Use this to verify your endpoint is receiving and processing webhook deliveries correctly before relying on it in production.

See also: [API Keys](/docs/manual/console-app/developer/api-keys) | [OAuth Clients](/docs/manual/console-app/developer/oauth-clients)
