# Tenant Reset

Consolidated tool for wiping tenant data. Replaces the drifting logic that used
to live in `cleanup-for-testing.ts`, `qa-tenant-reset.ts`, and `demo/stage-0-tenant.ts`.

## Modes

| Mode | Keeps | Wipes |
|------|-------|-------|
| `soft` | Tenant shell, users, fleet (drivers/vehicles/trailers + pay structures + preferences), tenant config (fleet ops, alert config, invoice settings, email ingest, custom fields), factoring config, shield custom rules, desk agents/responsibilities, integration creds (timestamps reset), platform billing (wallet, subscription, billing customer), vehicle telematics snapshot | Everything operational: loads, routes, money, alerts, AI chat, desk runtime (episodes/beats/tool calls/decisions/outcomes/memory), shield audits/findings, EDI, IFTA, email ingest threads/messages, webhooks, oauth, lanes, customers, fleet artifacts (DVIRs, unavailabilities), login events, documents, support tickets, saved searches, notifications |
| `hard` | Nothing | Everything in soft + fleet entities + users + tenant config + desk config + factoring config + platform billing + the tenant row itself |

## Usage

```bash
# Preview what would be deleted
pnpm tenant:reset --tenant <slug> --mode soft --dry-run

# Soft reset (keeps fleet + users + config)
pnpm tenant:reset --tenant <slug> --mode soft --yes

# Hard reset (deletes tenant entirely)
pnpm tenant:reset --tenant <slug> --mode hard --yes \
                 --i-understand-this-deletes-the-tenant
```

## Safety gates

In order:

1. Blocks when `NODE_ENV=production`.
2. Blocks when `DATABASE_URL` host matches `/prod|production/i`.
3. Blocks when the tenant slug is not in `ALLOWED_TENANTS` (see `safety.ts`).
4. Blocks when the tenant doesn't exist in the current DB.
5. Without `--yes`, prompts you to type the slug exactly (not just "yes").
6. Hard mode (non-dry-run) additionally requires `--i-understand-this-deletes-the-tenant`.

## Adding a new tenant to the allowlist

Edit `ALLOWED_TENANTS` in `scripts/tenant-reset/safety.ts`. Do not add
production tenant slugs unless you explicitly want them to be resettable.

## Adding a new tenant-scoped model

When you add a new Prisma model with `tenantId`:

1. Register it in `scripts/tenant-reset/registry.ts` — pick a category, set
   `soft: 'wipe'` or `'keep'`, declare the scope, implement `run()`.
2. If it's indirectly scoped via a parent relation, add a count predicate to
   `INDIRECT_COUNT_PREDICATES` in `core.ts` for dry-run support.
3. Run `pnpm --filter @sally/backend test` — the schema-drift test fails if
   any tenant-scoped model is missing from the registry.

## Architecture

```
scripts/tenant-reset/
  registry.ts    Source of truth: every tenant-scoped model + deletion metadata
  safety.ts      Gates (prod block, allowlist, slug confirmation)
  core.ts        Orchestration: soft()/hard(), FK-nulling, $transaction
  cli.ts         Command-line entry point
  index.ts       Barrel for programmatic imports
  __tests__/
    registry.spec.ts   Schema-drift test — fails CI on unregistered models
    safety.spec.ts
    core.spec.ts
```

## Callers

- `pnpm tenant:reset` — the CLI. One tool, two modes. For everything.
- `pnpm setup:demo --reset` — the demo engine's `stage-0 resetDemoData()`
  delegates to `runReset({ mode: 'hard' })` and then cleans up Firebase.
