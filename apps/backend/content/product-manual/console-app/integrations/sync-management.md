---
title: "Sync Management"
documentType: guide
audience: all
category: console
keywords: [sync, integration, health, logs, re-sync, troubleshooting, errors]
---

# Sync Management

The sync management page gives you visibility into the health and history of all connected integrations. Use it to monitor sync status, investigate errors, and force re-syncs when needed.

## Accessing Sync Management

Navigate to **Console → Integrations → Sync**.

## Sync Health Dashboard

The dashboard shows each connected integration (Samsara, QuickBooks, etc.) with:

- **Status**: Healthy (syncing normally), Warning (minor issues), or Error (sync has failed).
- **Last sync time**: When the most recent successful sync completed.
- **Records synced**: Count of records processed in the last sync (drivers, vehicles, invoices, etc.).
- **Error count**: Number of errors since the last successful full sync.

## Sync Logs

Click any integration to view its detailed sync logs. Each log entry shows:

- **Timestamp**: When the sync operation ran.
- **Type**: Full sync, incremental sync, or manual re-sync.
- **Records processed**: How many records were created, updated, or skipped.
- **Errors**: Detailed error messages for any records that failed to sync.

## Forcing a Re-Sync

If data seems stale or out of sync:

1. Click the integration name to open its detail view.
2. Click **Re-Sync**. This triggers a full re-sync, pulling all data from the external system and reconciling it with SALLY.
3. Monitor the sync log to verify completion.

Re-syncs are safe to run at any time. They do not create duplicate records — SALLY matches existing records by unique identifiers.

## Common Troubleshooting

- **API key expired**: The most common cause of sync failures for Samsara. Navigate to Console → Integrations → Connections and update the API key.
- **Rate limit hit**: External APIs have request limits. SALLY automatically retries, but persistent rate limiting may indicate an unusually large fleet or too-frequent sync intervals. Contact support if this persists.
- **Field mapping errors**: Occurs when data in the external system does not match expected formats. Check the error log for specific field details and correct the source data.
- **OAuth token expired** (QuickBooks): Reconnect the integration through Console → Integrations → Connections to refresh the OAuth token.

See also: [Samsara Setup](/docs/manual/console-app/integrations/samsara-setup) | [QuickBooks Setup](/docs/manual/console-app/integrations/quickbooks-setup)
