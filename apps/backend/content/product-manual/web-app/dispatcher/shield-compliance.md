---
title: "Shield Compliance Engine"
documentType: guide
audience: all
category: dispatcher
keywords: [shield, compliance, audit, score, findings, CDL, medical card, FMCSA]
---

# Shield Compliance Engine

> This feature requires the Fleet plan or higher.

Shield is SALLY's compliance scoring and auditing system. It continuously evaluates your fleet's compliance posture and surfaces findings that need attention before they become violations.

## Compliance Score

Navigate to **Shield** in the sidebar. The overview page displays your fleet's **compliance score** on a 0-100 scale. The score reflects the aggregate state of driver credentials, vehicle documentation, HOS compliance, and operational practices. A higher score means fewer compliance risks.

The score updates as findings are created and resolved, giving you a real-time pulse on your fleet's regulatory health.

## Running an Audit

While Shield monitors continuously, you can trigger a manual audit at any time:

1. Click **Run Audit** on the Shield overview page.
2. SALLY evaluates all drivers, vehicles, and active loads against compliance rules.
3. New findings appear in the findings list within moments.

Manual audits are useful before DOT inspections, during onboarding new drivers, or after making bulk fleet changes.

## Viewing Findings

Findings are organized by severity:

- **Critical**: Immediate regulatory risk — expired CDL, missing medical card, active HOS violation.
- **High**: Near-term risk — credentials expiring within 30 days, incomplete documentation.
- **Medium**: Should be addressed — minor documentation gaps, best practice recommendations.
- **Low**: Informational — suggestions for improving compliance posture.

Each finding shows:

- **Issue description**: What the compliance problem is.
- **Affected entity**: The specific driver, vehicle, or load involved.
- **Recommended remediation**: The action needed to resolve the finding.

## Tracking Remediation

As you address findings — renewing a CDL, uploading a missing document, correcting an HOS issue — mark findings as resolved. The compliance score recalculates automatically. Track your organization's compliance trend over time from the Shield overview.

## Integration with Alerts

Critical compliance findings automatically generate alerts in the alert system. This ensures that urgent compliance issues surface in the command center and notification channels, not just on the Shield page. Dispatchers and admins are notified immediately when a critical finding is detected.

See also: [Alerts & Monitoring](/docs/manual/web-app/dispatcher/alerts-monitoring) | [Documents](/docs/manual/web-app/dispatcher/documents) | [Managing Drivers](/docs/manual/web-app/dispatcher/managing-drivers)
