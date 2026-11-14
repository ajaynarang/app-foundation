# ADR-0013 — Outbound webhooks: SSRF guard at save and at delivery; Standard Webhooks signing

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

A tenant admin can register a URL that the server will call on every subscribed event. That makes the server an
HTTP client pointed wherever a customer says: at its own database, at the cloud metadata endpoint, or at a public
name that later resolves to an internal address. Receivers, in turn, need a way to prove a request came from this
server and is not a replay, ideally with a library they already have.

## Decision

**The server never delivers a webhook to a non-public address, checked when the subscription is saved and again on
the connection that delivers it. Every delivery is signed per Standard Webhooks.**

- **SSRF guard** (`packages/appshore/kernel/src/infrastructure/outbound-webhooks/webhook-url.validator.ts`):
  - Refused: private, loopback, link-local, unique-local, CGNAT, multicast, reserved and documentation ranges,
    IPv4 and IPv6, and the cloud metadata endpoints by address and by name.
  - **At save**, `assertSafeWebhookTarget` checks the URL and every address its host resolves to, and answers 400. A
    host that does not resolve is refused.
  - **At delivery**, `assertDeliverableWebhookUrl` checks the URL again, and `createSafeWebhookAgents` resolves the
    host on the connection itself and refuses it if any address is blocked. The socket connects only to an address
    that check returned, so DNS rebinding is refused on the connection that would have used it.
  - **Redirects are never followed** (`maxRedirects: 0` in
    `apps/backend/src/platform-glue/webhooks/delivery.processor.ts`); a 3xx is a failed delivery.
  - Held by `webhook-url.validator.spec.ts` (kernel), and `delivery-egress.spec.ts`, `delivery.processor.spec.ts` and
    `subscription.service.spec.ts` under `apps/backend/src/platform-glue/webhooks/__tests__/`.
  - `WEBHOOK_ALLOW_PRIVATE_TARGETS` lets a developer deliver to localhost. Production refuses to boot with it set
    (`apps/backend/src/config/configuration.ts`), and metadata addresses stay refused even with it.
- **Signing** (`apps/backend/src/platform-glue/webhooks/standard-webhooks.ts`, held by `standard-webhooks.spec.ts`):
  - Headers `webhook-id`, `webhook-timestamp`, `webhook-signature` (`WEBHOOK_HEADERS` in `@app/shared-types`). The
    signature is `v1,<base64 HMAC-SHA256>` over `id.timestamp.body`, so receivers verify with any Standard Webhooks
    library and reject old timestamps.
  - The `webhook-id` is stable across retries of one delivery; receivers de-duplicate on it.
  - Secrets are `whsec_` plus 32 random bytes, shown once.
  - `POST /webhooks/:id/rotate-secret` issues a new secret. The old one keeps signing alongside it for an overlap
    window (24 hours by default), so a receiver can switch without dropping a delivery.
  - The legacy `X-Webhook-Signature` headers (`LEGACY_WEBHOOK_HEADERS`) are still sent and marked deprecated.

## Consequences

- A receiver on a private network cannot be reached from a deployed stack. That is the point; it uses a public
  endpoint or a tunnel.
- Every delivery costs a DNS lookup on the connection. The cost is accepted.
- Removing the legacy headers is a wire change: it needs an upgrade note and a version under the ADR
  [API contract](0001-api-contract.md).
- Signing secrets are stored as issued (ADR [Credentials at rest](0012-credentials-at-rest.md)).
