---
title: "Troubleshooting"
documentType: reference
audience: all
category: reference
keywords: [troubleshooting, issues, errors, locked features, sync, alerts, invitations]
---

# Troubleshooting

This guide covers common issues and their solutions. If your issue is not listed here, contact support at support@appshore.in.

## Feature Appears Locked (Sparkle Icon)

**Symptom**: A sidebar item or feature shows a sparkle icon and you cannot access it.

**Cause**: The feature requires a higher plan tier than your current subscription.

**Solution**: Check your plan at **Console → Account → Plan & Billing**. The locked feature's required plan is listed. Upgrade your plan or contact sally@appshore.in for Freight Force pricing.

## Integration Sync Not Working

**Symptom**: Data from Samsara or QuickBooks is not updating in SALLY.

**Solution**:
1. Navigate to **Console → Integrations → Sync** and check for error messages.
2. Common causes:
   - **API key expired** (Samsara): Go to Console → Integrations → Connections and update the API key.
   - **OAuth token expired** (QuickBooks): Click Reconnect to refresh the authorization.
   - **Rate limit**: Wait and retry. If persistent, contact support.
3. Click **Re-Sync** to force a full data refresh.

## Alerts Not Showing

**Symptom**: You expect to see alerts but the alerts page is empty.

**Solution**:
1. Verify your plan includes alerts: Fleet plan or higher is required.
2. Check alert settings in **Console → Configuration → Alerts**. Ensure alert types are enabled and thresholds are configured.
3. Verify that Samsara is connected (required for HOS and telematics-based alerts).
4. Check notification channel settings — in-app alerts must be enabled.

## Sally AI Not Responding

**Symptom**: Sally chat is not loading or responding to messages.

**Solution**:
1. Check your internet connection.
2. Refresh the page (Cmd+R / Ctrl+R).
3. Clear your browser cache and try again.
4. If the issue persists across multiple sessions, contact support@appshore.in.

## Cannot Invite Users

**Symptom**: The invite button is disabled or invitations fail.

**Solution**:
1. Check your user limit at **Console → Account → Plan & Billing**. Haul allows 5 users, Fleet allows 25, Freight Force is unlimited.
2. If at the limit, deactivate unused accounts or upgrade your plan.
3. Verify the email address is not already associated with an active or pending user.

## Invoice Not Sending

**Symptom**: Clicking Send on an invoice does not deliver the email.

**Solution**:
1. Verify the customer record has a valid **email address** in Fleet → Customers.
2. Check invoicing settings in **Console → Configuration → Invoicing** — ensure the reply-to address is configured.
3. Ask the customer to check their spam/junk folder.
4. If the email was sent (check invoice status), the issue may be on the recipient's email server side.

## Driver Cannot See Assigned Load

**Symptom**: A driver reports they do not see their assigned load.

**Solution**:
1. Verify the load is assigned to the correct driver in the load detail sheet.
2. Ensure the load status is at least **Dispatched**. Draft and Booked loads are not visible to drivers.
3. Ask the driver to refresh their app (pull down to refresh or close and reopen).
4. Verify the driver's account is Active (not Deactivated or On Leave).

## Route Plan Shows HOS Violation

**Symptom**: Route optimization returns an HOS violation warning.

**Solution**:
1. Check the driver's current HOS state — they may not have enough hours to complete the route.
2. Review the route timeline for segments that exceed driving limits.
3. Try re-optimizing with a different priority or fewer loads.
4. If the driver needs a reset, adjust the route start time to after the required 10-hour rest period.

See also: [Understanding Your Plan](/docs/manual/getting-started/understanding-your-plan) | [Sync Management](/docs/manual/console-app/integrations/sync-management) | [Alert Settings](/docs/manual/console-app/configuration/alert-settings)
