---
title: "Feature Flags"
documentType: guide
audience: all
category: admin
keywords: [feature flags, plan gating, rollout, features, entitlements]
---

# Feature Flags

Feature flags control which features are enabled for your organization. They work alongside plan entitlements to determine what is available in your SALLY instance.

## How Feature Flags Work

SALLY uses two mechanisms to control feature availability:

1. **Plan entitlements**: Features tied to your subscription tier (Haul, Fleet, or Freight Force). These are determined by your plan and change when you upgrade.
2. **Feature flags**: Toggles managed by the SALLY platform team for gradual rollout of new features, beta testing, or organization-specific configurations.

## Viewing Your Features

Navigate to **Console → Account → Plan** to see your current plan and a full list of enabled features. Features are grouped by category (fleet operations, AI capabilities, integrations, developer tools). Each feature shows whether it is enabled, disabled, or requires a plan upgrade.

## Plan-Gated Features

Features locked behind a higher plan show a **sparkle icon** in the Web App sidebar. Clicking a locked feature displays a message indicating which plan is required. Common plan gates:

- **Haul**: Core TMS features (loads, fleet, billing, pay, close-out, driver app, Sally AI chat)
- **Fleet**: Command center, route planning, alerts, Shield, Samsara, Sally AI actions/voice/doc intelligence
- **Freight Force**: QuickBooks, developer platform (API, webhooks, OAuth, MCP), priority support

## Feature Rollouts

Occasionally, SALLY introduces new features through a phased rollout. During a rollout, the feature may appear for some organizations before others. If you see a feature mentioned in documentation that is not yet available in your account, it may be in a rollout phase. Contact support@appshore.in for availability information.

## Requesting Features

If you need a feature that is not available on your current plan, you have two options:

1. **Upgrade your plan**: Visit Console → Account → Plan & Billing.
2. **Contact sales**: Email sally@appshore.in for custom arrangements or Freight Force pricing.

See also: [Understanding Your Plan](/docs/manual/getting-started/understanding-your-plan) | [Plan & Billing](/docs/manual/console-app/team-account/plan-billing)
