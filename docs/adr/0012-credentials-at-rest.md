# ADR-0012 — Credentials at rest: keys hashed, secrets encrypted, production refuses defaults

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

A database dump, a backup or a read-only SQL bug should not hand an attacker working credentials. The starter used
to store API keys in plain text, encrypt integration credentials with a key that had a hardcoded fallback, and boot
in production with development secrets. This record fixes how each kind of credential is stored and what
production refuses at boot.

## Decision

**A credential the server only has to recognise is stored as a hash. A credential the server has to use is
encrypted with a key that production must set. Production refuses to boot on a missing, default or placeholder
secret.**

- **Recognised, so hashed.**
  - API keys: the sha256 `ApiKey.keyHash`, plus `keyPrefix` and `keyLast4` for display; lookup is by hash. The full
    key is shown once, at creation or rotation, and never stored. Held by
    `packages/appshore/platform/src/domains/api-keys/__tests__/api-key-storage.spec.ts`.
  - Refresh tokens (`RefreshToken.token`, SHA-256 of the signed token), password-reset tokens
    (`PasswordResetToken.tokenHash`), OAuth access tokens (`OAuthAccessToken.tokenHash`) and OAuth client secrets
    (bcrypt in `OAuthClient.clientSecret`).
- **Used, so encrypted.**
  - Integration credentials: `CredentialsService`
    (`apps/backend/src/domains/integrations/credentials/credentials.service.ts`) writes AES-256-GCM as
    `v1:<nonce>:<tag>:<data>` under `CREDENTIALS_ENCRYPTION_KEY`. It still reads the legacy AES-256-CBC format, so
    stored values keep working and move to v1 on their next save. It has no key of its own, and refuses the public
    development key in production. Held by `credentials.service.spec.ts` beside it.
  - Workspace AI keys (bring-your-own-key) use their own envelope, `credential-crypto.service.ts` under
    `apps/backend/src/domains/ai/routing/`, AES-256-GCM bound to the tenant and credential, under
    `AI_CREDENTIALS_KEY` (ADR [AI provider routing is per tenant](0005-ai-provider-routing-per-tenant.md)).
- **Production boot guard.** The config schema's `superRefine` in `apps/backend/src/config/configuration.ts` fails
  the boot in production when any signing or encryption secret is unset, equal to its built-in development default,
  a placeholder (`isPlaceholderSecret` in `production-guard.ts`), or shorter than its minimum. It also refuses
  `OAUTH_CONSENT_SECRET` equal to `OAUTH_JWT_SECRET`, an `OAUTH_ISSUER` that is local or not https, and a localhost
  CORS origin (`findLocalCorsOrigins`). Held by `apps/backend/src/config/__tests__/configuration.spec.ts`.
- **Secrets come from the environment** (Doppler in a deployed stack; `docs/doppler.md`), never from the repo. An
  `.env.example` holds names and placeholders only. Review only.

## Consequences

- A leaked database does not leak a usable API key, session or OAuth client. It does leak ciphertext, which is
  useless without the encryption key held outside the database.
- A lost `CREDENTIALS_ENCRYPTION_KEY` or `AI_CREDENTIALS_KEY` makes the stored credentials unreadable; tenants
  reconnect. The AI envelope carries a `keyVersion`, so its key rotates by adding a version; the integrations key
  has no rotation path yet.
- **Outbound webhook signing secrets are stored as issued** (`WebhookSubscription.secret`), because the server signs
  with them (ADR [Outbound webhooks](0013-outbound-webhooks.md)). Encrypting them is a later decision.
- A first production deploy fails fast with a list of every secret still missing. That is intended.
