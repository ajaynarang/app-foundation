---
owner: foundation
sources:
  - apps/backend/src/config/configuration.ts#configSchema
  - apps/backend/src/config/configuration.ts#guardedConfigSchema
  - apps/backend/src/config/production-guard.ts#isProductionEnv
  - apps/backend/src/config/production-guard.ts#isPlaceholderSecret
  - apps/backend/.env.example
  - apps/web/.env.example
  - packages/appshore/platform/src/domains/feature-flags/feature-flags.service.ts#isEnabled
  - docs/doppler.md
  - docs/adr/0012-credentials-at-rest.md
guards:
  - configuration.spec.ts
  - gate:process-env
  - ai-routing-config.spec.ts
  - .claude/hooks/protected-paths.mjs
---

# Config and secrets: the config schema, the production boot guard, Doppler, `process.env`, feature flags

Every setting the backend owns is a field of one zod schema, `configSchema` in
`apps/backend/src/config/configuration.ts`, validated at boot and read through Nest's `ConfigService`
(`configService.get('jwt.accessExpiry')`). Secrets come from Doppler in every deployed environment and from a local,
ignored `.env` on a developer machine (`docs/doppler.md`). Settings a vendor library owns (SMTP, Twilio, pool tuning)
are read at their point of use and documented in `apps/backend/.env.example` instead.

## Rules

- A new setting the app owns is a field of `configSchema`, mapped from its variable in the default export, with a
  default only when the default is safe in production. [guard: configuration.spec.ts]
- `process.env` is read only in config files, bootstrap files (`main.ts`, `bootstrap/`, instrumentation, telemetry),
  scripts and seeds. Everything else asks `ConfigService`. Existing hits are baselined and may only fall.
  [guard: gate:process-env]
- The AI routing code reads its keys through `ConfigService`, never `process.env`. [guard: ai-routing-config.spec.ts]
- An unset, empty or whitespace variable counts as unset, so the schema default applies and production refuses a
  required secret. [guard: configuration.spec.ts]
- Production is `isProductionEnv()`: `NODE_ENV=production` or `ENV_TYPE=production`, either one. Never test
  `NODE_ENV` or `ENV_TYPE` yourself. [guard: configuration.spec.ts]
- The production boot guard (`guardedConfigSchema`) refuses to start on a missing required secret, a built-in
  development default, a placeholder value (`isPlaceholderSecret`), a secret below its length, a local CORS origin, a
  local or non-https OAuth issuer, a dev-mode switch, and private webhook targets. It reports every problem at once. A
  new secret gets an entry in its list with a generate hint. [guard: configuration.spec.ts]
- A measurement switch (prompt-cache override, usage capture) resolves to unset in the schema mapping when
  `isProductionEnv()` is true, so no caller needs its own environment check. [guard: configuration.spec.ts]
- A retired variable is listed in `RETIRED_AI_ENV_VARS`: still set, it earns a boot warning and is never read.
  [review-only: the warning is read by the operator]
- A credential stored for a tenant is encrypted at rest; the decision is `docs/adr/0012-credentials-at-rest.md`.
  [review-only: the ADR records the cipher choice; the specs of each cipher hold it]
- A new or renamed variable goes into the schema, the matching `.env.example` and the variable table in
  `docs/doppler.md` in the same pull request. [review-only: the drift reminder names the files; nothing compares them]
- Real env files are never edited by an assistant and never read: only the `.env.example` files.
  [guard: .claude/hooks/protected-paths.mjs]
- A platform kill switch is a feature flag read with `FeatureFlagsService.isEnabled(key)`, and a lookup that fails
  counts as off. A plan gate is not a feature flag: see [`plans-and-entitlements.md`](plans-and-entitlements.md).
  [review-only: needs reading]

## Recipe: add a secret the backend needs

1. Add the field to `configSchema` (for a secret: `z.string().optional()`; the guard decides whether it is required).
2. Map it in the default export: `myVendorKey: env('MY_VENDOR_KEY')`.
3. If production must have it, add an entry to the secrets list in `guardedConfigSchema` with `required`,
   `minLength` and a `hint` that says how to generate it. A dev fallback goes in `devDefault`, so production refuses it.
4. Add a case to `apps/backend/src/config/__tests__/configuration.spec.ts`: production boots with it set and refuses it
   unset or as a placeholder.
5. Document it: a commented line in `apps/backend/.env.example` and a row in `docs/doppler.md`. Set it in each
   Doppler config (`doppler secrets set MY_VENDOR_KEY=<value> --project app-backend --config dev`; the command forms
   are in `docs/doppler.md`, "Updating a variable").
6. Read it where it is used with `configService.get<string>('myVendorKey')`.

## Flag in review

- `process.env.X` in a service, controller or job.
- `NODE_ENV === 'production'` instead of `isProductionEnv()`.
- A secret with a default that production would accept.
- A new variable missing from `.env.example` or the Doppler doc.
- A kill switch that fails open.
