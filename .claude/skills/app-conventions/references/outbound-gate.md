---
owner: foundation
sources:
  - docs/adr/0006-outbound-gate.md
  - docs/operations.md
  - packages/appshore/kernel/src/infrastructure/outbound/outbound-gate.port.ts#OUTBOUND_GATE
  - packages/appshore/kernel/src/infrastructure/outbound/outbound-gate.port.ts#OUTBOUND_SOURCE
  - packages/appshore/kernel/src/infrastructure/outbound/outbound-gate.port.ts#OutboundGate
  - packages/appshore/kernel/src/infrastructure/outbound/outbound-mode.ts#resolveOutboundMode
  - packages/appshore/kernel/src/infrastructure/outbound/outbound-mode.ts#assertOutboundSafety
  - packages/appshore/kernel/src/infrastructure/outbound/testing/outbound-gate.testing.ts#allowAllOutboundGate
  - packages/appshore/kernel/src/infrastructure/outbound/testing/outbound-gate.testing.ts#holdAllOutboundGate
  - packages/appshore/kernel/src/infrastructure/sms/sms.service.ts
  - packages/appshore/platform/src/infrastructure/outbound/outbound-policy.service.ts#OutboundPolicyService
  - packages/appshore/platform/src/infrastructure/notification/services/email.service.ts#EmailService
  - packages/appshore/platform/src/infrastructure/notifications/pipeline/delivery.service.ts
  - packages/appshore/platform/src/infrastructure/notifications/channels/whatsapp/whatsapp-send.handler.ts
  - packages/appshore/platform/src/infrastructure/notifications/channels/push/web-push.service.ts#PushService
  - packages/appshore/platform/src/infrastructure/notifications/channels/push/fcm.service.ts
  - apps/backend/src/platform-glue/webhooks/delivery.processor.ts
  - apps/backend/src/architecture/outbound-gate-coverage.spec.ts
guards:
  - outbound-gate-coverage.spec.ts
  - outbound-mode.spec.ts
  - configuration.spec.ts
  - outbound-policy.service.spec.ts
  - outbound-allow-kind-parity.spec.ts
  - outbound-channel-parity.spec.ts
  - delivery.service.spec.ts
  - whatsapp-send.handler.spec.ts
  - email.service.spec.ts
  - sms.service.spec.ts
  - delivery.processor.spec.ts
  - outbound-admin.service.spec.ts
examples:
  - LetterService
  - LetterClient
  - letterClient
  - sendLetter
---

# Outbound gate: every send to a person or a system outside

Every email, SMS, sign-in code, push notification, WhatsApp message and customer webhook passes one check, the
outbound gate (`OUTBOUND_GATE`), just before its provider is called. Outside production it keeps a test environment
from messaging real people. The decision is the ADR "Outbound gate", `docs/adr/0006-outbound-gate.md`; the operator's
side (modes, the allow-list page, the bootstrap list, what a held-back send looks like) is "Outbound gate" in
`docs/operations.md`.

| Mode        | Default where                                             | What it does                                                               |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `live`      | `ENV_TYPE=production`                                     | Sends to everyone, unmarked                                                |
| `allowlist` | `sandbox`, `preprod`, `development`, and `ENV_TYPE` unset | Sends only to allow-listed recipients, marked as staging; records the rest |

The port is in the kernel; `OutboundPolicyService` in platform implements it and is bound globally, so a sender only
injects the token.

## Rules

- A send primitive (a Resend, Twilio or SMTP client, a Web Push or FCM send, a WhatsApp adapter's `sendTemplate`)
  appears only in the listed senders, and each injects `OUTBOUND_GATE` and calls it before the provider. A new
  sender goes through `EmailService`, `SmsService`, `PushService` or `FcmService`; one that needs its own client joins
  the spec's list with the gate in the same pull request. [guard: outbound-gate-coverage.spec.ts]
- `OUTBOUND_MODE` unset means `live` in production and `allowlist` everywhere else, read from `ENV_TYPE`, never
  `NODE_ENV`. Boot refuses `allowlist` in production, and `live` outside production without
  `OUTBOUND_LIVE_OUTSIDE_PRODUCTION=true`. [guard: outbound-mode.spec.ts, configuration.spec.ts]
- The allow-list is the table edited at `/admin/outbound` merged with `OUTBOUND_ALLOWLIST_BOOTSTRAP`. When the table
  cannot be read the gate fails closed: only the bootstrap entries pass. An empty list sends nothing.
  [guard: outbound-policy.service.spec.ts]
- An email is gated per recipient: `gateEmail` drops each `to`, `cc` and `bcc` not on the list, and returns `null`
  when no `to` is left, so nothing is sent. [guard: outbound-policy.service.spec.ts]
- A held-back send is recorded once. Through the notification pipeline or WhatsApp, the pipeline asks `wouldAllow`
  first (no side effect) and ledgers the delivery `SKIPPED` with reason `GATED`. A direct send (sign-in codes,
  invitations, password resets, webhooks) is recorded by the gate itself in the held-back list, masked, with codes
  and links removed. [guard: delivery.service.spec.ts, whatsapp-send.handler.spec.ts,
  outbound-policy.service.spec.ts]
- What `allowlist` mode does send is marked: `[STAGING]` on an email subject, `STG:` before an SMS, `[STG]` on a push
  title; the sender applies `markSms` and `markPushTitle`, `gateEmail` the subject. WhatsApp templates go unchanged.
  [guard: outbound-policy.service.spec.ts, sms.service.spec.ts]
- The gate sits in front of real providers only: the development console path (no provider, `ENV_TYPE=development`,
  the message printed masked) is never gated, so a fresh clone works with no keys. [guard: email.service.spec.ts,
  sms.service.spec.ts]
- A held-back customer webhook closes its delivery log entry as held back; it is not a failure and is not retried.
  [guard: delivery.processor.spec.ts]
- A failed send counts `recordOutboundFailed(channel)`; a held-back one does not. [guard: email.service.spec.ts]
- A unit test binds `allowAllOutboundGate()` or `holdAllOutboundGate()`, never the real policy.
  [review-only: a test's providers are read, not scanned]

## Recipe: add a send site behind the gate

**Prefer an existing sender.** A new email, SMS or push to a person is a call to `EmailService.sendEmail`,
`SmsService.sendSms` or a notification trigger through the pipeline ([`platform-services.md`](platform-services.md)).
The gate is already inside; nothing else to do.

**A new channel with its own client** (a letter-post API, a new chat provider):

1. Inject the gate and ask it before the provider. Use `allowPhone`, `allowUser` or `allowUrl` for the recipient kind,
   or `gateEmail` for an email-shaped message; add an `OUTBOUND_SOURCE` entry so the held-back list says who asked.

   ```ts
   constructor(@Inject(OUTBOUND_GATE) private readonly outboundGate: OutboundGate, private readonly letterClient: LetterClient) {}

   async sendLetter(phone: string, text: string, tenantId: number): Promise<boolean> {
     if (!(await this.outboundGate.allowPhone(phone, { source: OUTBOUND_SOURCE.SMS, tenantId }))) return false;
     await this.letterClient.send(phone, this.outboundGate.markSms(text));
     return true;
   }
   ```

2. Add the file to `GATED_FILES` (or `GATED_HTTP_SENDERS` for a plain HTTP sender) and its client to
   `SEND_PRIMITIVES` in `apps/backend/src/architecture/outbound-gate-coverage.spec.ts`.
3. If the send has a delivery-ledger row, ask `wouldAllow` before it and ledger `SKIPPED` / `GATED`, as
   `whatsapp-send.handler.ts` does, so the hold-back is recorded once.
4. Count failures with `recordOutboundFailed` ([`observability.md`](observability.md)); a new channel adds its value to
   `OUTBOUND_CHANNEL`, which `outbound-channel-parity.spec.ts` holds against the ledger's channels.
5. Test it twice: with `allowAllOutboundGate()` (the provider is called, the text is marked) and with
   `holdAllOutboundGate()` (the provider is never called).

## Flag in review

- A provider SDK imported in a domain service instead of going through a sender.
- A sender that checks the gate after building or queuing the provider call, or only on one branch.
- A held-back send logged at error or counted as a failure.
- `OUTBOUND_MODE=live` in a non-production env file or Terraform variable.
