import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@appshore/db';
import { RLS_CLASS, type RlsTableEntry } from '@appshore/platform/infrastructure/database/rls-registry';
import { RLS_REGISTRY } from '../../../src/platform-glue/database/app-rls-registry';
import { REGISTRY, REGISTERED_TABLES, entriesForMode, type ResetContext } from '../registry';

/**
 * The reset registry against the tenant-isolation registry (design item 31, coverage from item 20): every table the
 * isolation registry calls tenant-owned is reset, and no global table ever is.
 */

/** Classes whose rows belong to one tenant: each must be in the reset registry. */
const MUST_RESET: readonly string[] = [RLS_CLASS.TENANT, RLS_CLASS.TENANT_NULLABLE, RLS_CLASS.CHILD];
/** Scoped through the user; a hard reset deletes the rows of the users it deletes. Registered or cascaded. */
const MAY_RESET: readonly string[] = [RLS_CLASS.IDENTITY];

const SCHEMA_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'appshore',
  'db',
  'prisma',
  'schema',
);

/** Table name → Prisma model name, read from the schema files (`@@map`). */
function modelsByTable(): Map<string, string> {
  const schema = fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.prisma'))
    .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'))
    .join('\n');
  const out = new Map<string, string>();
  for (const [, model, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    out.set(/@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model, model);
  }
  return out;
}

function coverageViolations(
  isolation: Readonly<Record<string, RlsTableEntry>>,
  registered: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const [table, entry] of Object.entries(isolation)) {
    if (MUST_RESET.includes(entry.class) && !registered.has(table)) {
      out.push(`${table} is ${entry.class} but is not in the tenant reset registry`);
    }
  }
  for (const table of registered) {
    const entry = isolation[table];
    if (!entry) out.push(`${table} is in the tenant reset registry but not in the RLS registry`);
    else if (!MUST_RESET.includes(entry.class) && !MAY_RESET.includes(entry.class)) {
      out.push(`${table} is ${entry.class}, a global table, and must never be reset`);
    }
  }
  return out;
}

describe('tenant reset registry', () => {
  it('resets every tenant, tenant_nullable and child table, and no global one', () => {
    expect(coverageViolations(RLS_REGISTRY, REGISTERED_TABLES)).toEqual([]);
  });

  it('never registers a catalog, platform, root or token table', () => {
    const global = Object.entries(RLS_REGISTRY)
      .filter(([, e]) => ![...MUST_RESET, ...MAY_RESET].includes(e.class))
      .map(([table]) => table);
    expect(global.length).toBeGreaterThan(0);
    expect(global.filter((t) => REGISTERED_TABLES.has(t))).toEqual([]);
    expect(REGISTERED_TABLES.has('tenants')).toBe(false);
  });

  it('names the Prisma delegate of each table', () => {
    const models = modelsByTable();
    const known = new Set<string>(Object.values(Prisma.ModelName));
    for (const entry of REGISTRY) {
      const model = models.get(entry.table);
      expect({ table: entry.table, model: model && known.has(model) ? model : undefined }).toEqual({
        table: entry.table,
        model,
      });
      expect({ table: entry.table, delegate: entry.delegate }).toEqual({
        table: entry.table,
        delegate: model.charAt(0).toLowerCase() + model.slice(1),
      });
    }
  });

  it('lists each table once', () => {
    expect(REGISTERED_TABLES.size).toBe(REGISTRY.length);
  });

  it('scopes every entry to the tenant or its deleted users, never to everything', () => {
    const ctx: ResetContext = { tenantDbId: 7, tenantId: 'tenant_x', deletableUserIds: [3] };
    for (const entry of REGISTRY) {
      const where = JSON.stringify(entry.where(ctx));
      expect({ table: entry.table, scoped: where.includes('7') || where.includes('[3]') }).toEqual({
        table: entry.table,
        scoped: true,
      });
    }
  });

  it('deletes users last, and only the users the context names', () => {
    const users = REGISTRY[REGISTRY.length - 1];
    expect(users.table).toBe('users');
    expect(users.where({ tenantDbId: 7, tenantId: 't', deletableUserIds: [] })).toEqual({ id: { in: [] } });
  });

  it('soft mode keeps the workspace, its people, configuration and billing', () => {
    const soft = new Set(entriesForMode('soft').map((e) => e.table));
    expect(entriesForMode('hard')).toBe(REGISTRY);
    for (const kept of ['users', 'workspace_members', 'user_invitations', 'api_keys', 'billing_customers', 'wallets']) {
      expect(soft.has(kept)).toBe(false);
    }
    for (const wiped of ['conversations', 'jobs', 'notifications', 'support_tickets', 'outbox_events']) {
      expect(soft.has(wiped)).toBe(true);
    }
  });

  describe('the coverage check bites', () => {
    it('fails for a tenant table that is not registered', () => {
      expect(coverageViolations({ orders: { class: RLS_CLASS.TENANT } }, new Set())).toEqual([
        'orders is tenant but is not in the tenant reset registry',
      ]);
    });

    it('fails for a registered global table', () => {
      expect(coverageViolations({ plan_configs: { class: RLS_CLASS.CATALOG } }, new Set(['plan_configs']))).toEqual([
        'plan_configs is catalog, a global table, and must never be reset',
      ]);
    });
  });
});
