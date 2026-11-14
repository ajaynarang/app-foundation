# Tenant reset

Deletes one workspace's data from a development, QA or staging database, in foreign-key order, in one
transaction. Use it to give a demo or QA workspace a clean start, or to remove a test workspace for good.

## Modes

| Mode   | Deletes                                                                                                                                                                                                                                  | Keeps                                                                                                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `soft` | Activity: AI chat (and its Mastra memory), AI and agent logs, support tickets, feedback, notifications and their delivery ledger, jobs, events, outbox rows, timers, sign-in history, Desk runs and memories, synced integration records | The workspace, its users, memberships and invitations, API keys, devices, configuration (integrations, webhooks, OAuth clients, AI budget and credentials, counters, Desk agents and responsibilities) and billing |
| `hard` | Everything in the table above, then the workspace row                                                                                                                                                                                    | Nothing of the workspace                                                                                                                                                                                           |

Hard mode and users: an account's home workspace is `User.tenantId`, but one account can belong to several
workspaces. Hard mode deletes the users whose home is this workspace and who belong to no other one. A user whose
home is here but who is also a member elsewhere keeps the account: it moves to that workspace (its default
membership if it has one, else the oldest) with that membership's role. Their sessions in the deleted workspace end.

Never touched: anything that belongs to no workspace. Super-admins, plans, entitlements, the add-on catalog, feature
flags, model pricing, job schedules, the knowledge base, vendor configs, announcements, the outbound allow-list and
processed billing events. `__tests__/registry.spec.ts` fails if one of them is ever registered.

## Usage

```bash
# What would be deleted, by table. Changes nothing.
DATABASE_URL=postgresql://... pnpm --filter @app/backend tenant:reset --tenant demo --mode soft --dry-run

# Soft reset
DATABASE_URL=postgresql://... pnpm --filter @app/backend tenant:reset --tenant demo --mode soft --yes

# Hard reset: deletes the workspace
DATABASE_URL=postgresql://... pnpm --filter @app/backend tenant:reset --tenant demo --mode hard --yes \
  --i-understand-this-deletes-the-tenant
```

`--tenant` takes the workspace's public id (`Tenant.tenantId`, such as `demo`), not its numeric key. `--mode` has no
default. For staging, open a tunnel first (`tools/db/tunnel.sh`, port 5433) and point `DATABASE_URL` at it.

## Safety checks

In order, before anything is read or deleted:

1. Refuses `ENV_TYPE=production`, and `NODE_ENV=production` (a deployed process).
2. Refuses when `DATABASE_URL` is unset (there is no default database) or its host contains `prod` or `production`.
3. Refuses a tenant that is not in `ALLOWED_TENANTS` in `safety.ts`. The template ships the two seeded demo
   workspaces, `demo` and `demo-two`. Add your QA and demo workspaces there; never a customer's.
4. Hard mode, except a dry run, needs `--i-understand-this-deletes-the-tenant`.
5. Refuses a tenant that does not exist in this database.
6. Without `--yes`, you type the tenant id to confirm.
7. Hard mode refuses while an announcement was written by a user it would delete. Delete or reassign it first.

A row in another workspace that still points at a user the reset deletes (rare: that user has no membership there)
stops the run with a foreign-key error. The transaction rolls back and nothing is changed.

## Adding a model

Every table the tenant-isolation registry (`@appshore/platform/infrastructure/database/rls-registry.ts`, plus your
`apps/backend/src/platform-glue/database/app-rls-registry.ts`) classes `tenant`, `tenant_nullable` or `child` must be
in `registry.ts`; `pnpm test` fails until it is. To add one:

1. Add an entry to `REGISTRY` in `registry.ts`: its table, Prisma delegate, category, `soft: 'wipe'` (activity) or
   `'keep'` (configuration, people, money), and a `where` when the table has no `tenantId` of its own (a child goes
   through its parent, as `conversation_messages` does).
2. Place it before every table it points at with a required relation. Children of a table it points at come before
   it.
3. Run `pnpm --filter @app/backend test scripts/tenant-reset`. With `DATABASE_URL` set,
   `core.integration.spec.ts` runs a real soft and hard reset; extend its seed when your table has a required
   relation to a user or to another tenant table.

## Files

```
registry.ts    every tenant table, in delete order, with soft-mode behaviour
safety.ts      the checks above
core.ts        the engine: dry-run counts, the transaction, users moved or deleted, Mastra memory
cli.ts         the command line
__tests__/     registry coverage, safety, engine (mocked) and a Postgres run (skipped without DATABASE_URL)
```
