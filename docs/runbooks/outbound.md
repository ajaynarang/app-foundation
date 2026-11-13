# Outbound alerts

Conventions, severity and escalation: [README.md](README.md).

## otp-provider-failures

**sev1.** The sign-in code provider (Twilio Verify, `TwilioVerifyService`) failed five or more times in ten minutes
(`app_otp_failed_total{reason="provider"}`). Wrong or expired codes (`reason="invalid"`) and the provider's per-number
limits (`reason="rate_limited"`) are not counted.

### What it means

People who sign in by phone cannot get or check a code. Password sign-in is not affected.

### First three checks

1. **Send or check?** Loki:
   ```logql
   {sel} | json | context="TwilioVerifyService" | level=~"50|error"
   ```
   The `err` field carries the provider's error code. Numbers are masked; never paste a full number into a query.
2. **Is the provider down?** The Twilio status page and the console's Verify logs for the service.
3. **Did a credential change?** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` in the
   environment's secrets. A rotated token fails every call at once.

### Mitigation

- Credential problem: fix the secret, redeploy.
- Provider outage: nothing to fix on our side; tell users who sign in by phone to use password sign-in if they have
  one, and wait.
- Account suspended or out of balance: the owner resolves it with the provider.

### Escalation

Not resolved in 30 minutes: escalate to the owner.

## outbound-failures

**sev2.** One channel (`email`, `sms`, `push`, `whatsapp`, `webhook`) failed three or more sends in ten minutes
(`app_outbound_failed_total`, label `channel`).

### What it means

Messages are not reaching people, or customer webhooks are not being delivered. It is sev2 because outside
development a send with no provider key configured fails and counts here on purpose, and a product may run without
an email provider at first; sign-in codes, which block people, have their own sev1 above.

### First three checks

1. **Which sender?** The alert's `channel` label, then the sender's lines:
   ```logql
   {sel} | json | context=~"EmailService|SmsService|FcmService|PushService|WhatsAppSendHandler|WebhookDeliveryProcessor" | level=~"40|50|warning|error"
   ```
   Recipients are masked in logs.
2. **Is a provider key set?** Email needs `RESEND_API_KEY` (or the four `SMTP_*` keys); SMS needs the Twilio keys and
   `TWILIO_PHONE_NUMBER`; push needs the Firebase or VAPID keys. With no email or SMS key, every such send outside development fails and
   counts here.
3. **Is the provider refusing?** The provider's dashboard (Resend, Twilio, Firebase) for a domain, quota or
   credential problem. For webhooks, one failing customer endpoint is usually theirs: the Per-tenant health board
   shows which tenant.

### Mitigation

- Missing or wrong key: set it, redeploy.
- Provider down or quota reached: raise the quota or wait. Notification deliveries are retried by their queue;
  password-reset and invitation emails are not, so ask affected users to request them again.
- A customer's webhook endpoint down: nothing to fix on our side; its deliveries retry with backoff.

### Escalation

None out of hours, unless password resets or invitations are failing for every user: then escalate to the owner.
