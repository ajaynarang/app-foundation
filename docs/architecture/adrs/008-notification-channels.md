---
title: "ADR-008: Multi-Channel Notifications"
description: Decision to implement a four-channel notification system with configurable routing.
---

# ADR-008: Multi-Channel Notifications

**Date:** 2025-10-01
**Status:** Accepted

## Context

SALLY serves multiple roles — dispatchers at desks, drivers on the road, customers tracking shipments, and admins managing operations. Each role has different notification needs and preferred channels. A critical compliance alert must not rely solely on an in-app notification that a driver might miss while driving. Conversely, a routine status update should not trigger an SMS that costs money and interrupts focus.

## Decision

We implemented a **four-channel notification system** with configurable routing:

**Channels:**

| Channel | Provider | Use case |
|---------|----------|----------|
| EMAIL | Resend | Invoices, settlement summaries, onboarding, weekly reports |
| SMS | Twilio | Driver alerts, OTP verification, critical compliance warnings |
| PUSH | Web Push (VAPID) | Real-time alerts for desktop and mobile browser users |
| IN_APP | Database + SSE | All notifications; the persistent notification center |

**Notification routing:**

- **18+ notification types** across 5 categories (operational, financial, compliance, system, communication).
- **Channel resolution order:** tenant-level defaults, then user-level overrides, then quiet hours filtering, then category-based suppression.
- **Alert escalation:** unacknowledged alerts are re-sent on escalating channels (in-app, then push, then SMS) until acknowledged or a timeout is reached.

**Infrastructure modules:** `notification/` (routing engine), `push/` (VAPID key management, subscription storage), `sms/` (Twilio adapter), `sse/` (real-time delivery).

**Alternatives considered:**

- **Single channel (in-app only):** Rejected — insufficient for safety-critical alerts to drivers who may not have the app open.
- **Third-party notification service (OneSignal, Novu):** Rejected — adds vendor lock-in and cost for a system that is core to SALLY's value proposition. The routing logic is deeply tied to SALLY's role and tenant model.

## Consequences

**Positive:**

- Users receive notifications on the channel most appropriate to urgency and context.
- Tenant admins can configure default channel preferences for their organization.
- Individual users can override defaults (e.g., a dispatcher who prefers SMS over email for settlement alerts).
- Alert escalation ensures critical compliance issues are not silently ignored.

**Negative:**

- Four channels mean four sets of delivery infrastructure to maintain, monitor, and debug.
- SMS and email introduce per-message costs that scale with tenant activity.
- Quiet hours and escalation logic add complexity to the notification pipeline — edge cases around timezone handling and escalation loops require careful testing.
- Push notification support depends on browser permission grants, which users can deny or revoke.
