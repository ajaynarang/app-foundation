import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@appshore/db';
import {
  FOUNDATION_RLS_REGISTRY,
  RLS_CLASS,
  isExternalTable,
  mergeRlsRegistry,
  type RlsTableEntry,
} from '@appshore/platform/infrastructure/database/rls-registry';
import { RLS_REGISTRY } from '../platform-glue/database/app-rls-registry';

/**
 * Every Prisma model is classified for tenant isolation (design item 20): a new model with no entry in the foundation
 * registry (`@appshore/platform/infrastructure/database/rls-registry.ts`) or the app's
 * (`platform-glue/database/app-rls-registry.ts`) fails here. The class must agree with the model's `tenantId` column.
 */

const SCHEMA_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'appshore', 'db', 'prisma', 'schema');

interface ParsedModel {
  model: string;
  table: string;
  /** Raw Prisma type of the `tenantId` field (`Int`, `Int?`, `String`), or null when absent. */
  tenantIdType: string | null;
}

function parseModels(schema: string): ParsedModel[] {
  const models: ParsedModel[] = [];
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = match;
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model;
    const tenantIdType = /^\s+tenantId\s+(\S+)/m.exec(body)?.[1] ?? null;
    models.push({ model, table, tenantIdType });
  }
  return models;
}

/** Classes with no tenant column of their own. */
const NO_TENANT_COLUMN: readonly string[] = [
  RLS_CLASS.CHILD,
  RLS_CLASS.IDENTITY,
  RLS_CLASS.CATALOG,
  RLS_CLASS.PLATFORM,
];

function tenantColumnViolation(m: ParsedModel, entry: RlsTableEntry): string | null {
  const where = `${m.model} (${m.table}) is ${entry.class}`;
  const got = m.tenantIdType ?? 'missing';
  if (entry.stringTenantColumn !== undefined) {
    if (entry.class !== RLS_CLASS.TENANT) return `${where}; only a tenant table may declare a string tenant column`;
    return m.tenantIdType === 'String' ? null : `${where} with a string tenant column but tenantId is ${got}`;
  }
  switch (entry.class) {
    case RLS_CLASS.TENANT:
      return m.tenantIdType === 'Int' ? null : `${where} but tenantId is ${got}, expected Int`;
    case RLS_CLASS.TENANT_NULLABLE:
      return m.tenantIdType === 'Int?' ? null : `${where} but tenantId is ${got}, expected Int?`;
    case RLS_CLASS.ROOT:
      return m.table === 'tenants' ? null : `${where}; only tenants may be root`;
    case RLS_CLASS.IDENTITY_SYSTEM:
      return m.tenantIdType === null || m.tenantIdType === 'Int?'
        ? null
        : `${where} but tenantId is ${got}; a token table carries at most a nullable tenant value`;
    default:
      return NO_TENANT_COLUMN.includes(entry.class) && m.tenantIdType !== null
        ? `${where} but has a tenantId column — reclassify it as tenant or tenant_nullable`
        : null;
  }
}

function findRegistryViolations(schema: string, registry: Readonly<Record<string, RlsTableEntry>>): string[] {
  const violations: string[] = [];
  const models = parseModels(schema);
  const tables = new Set(models.map((m) => m.table));

  for (const m of models) {
    const entry = Object.prototype.hasOwnProperty.call(registry, m.table) ? registry[m.table] : undefined;
    if (!entry) {
      violations.push(`${m.model} (${m.table}) has no entry in the RLS registry`);
      continue;
    }
    const columnProblem = tenantColumnViolation(m, entry);
    if (columnProblem) violations.push(columnProblem);
  }

  for (const [table, entry] of Object.entries(registry)) {
    if (!tables.has(table)) violations.push(`the RLS registry lists ${table}, which is not a Prisma model table`);
    if (isExternalTable(table)) violations.push(`${table} matches an external-table pattern but is registered`);

    const needsParent = entry.class === RLS_CLASS.CHILD || entry.class === RLS_CLASS.IDENTITY;
    if (needsParent) {
      const parent = entry.parent ? registry[entry.parent] : undefined;
      const parentOk = parent?.class === RLS_CLASS.TENANT || parent?.class === RLS_CLASS.TENANT_NULLABLE;
      if (!parentOk) violations.push(`${table} is ${entry.class} but its parent ${entry.parent} is not a tenant table`);
    } else if (entry.parent) {
      violations.push(`${table} is ${entry.class} and must not declare a parent`);
    }
  }
  return violations;
}

const schema = fs
  .readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith('.prisma'))
  .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'))
  .join('\n');

describe('RLS table registry', () => {
  it('classifies every Prisma model exactly once, consistent with its tenantId column', () => {
    expect(findRegistryViolations(schema, RLS_REGISTRY)).toEqual([]);
  });

  it('parses every model the Prisma client knows about (guards the regex parser)', () => {
    expect(
      parseModels(schema)
        .map((m) => m.model)
        .sort(),
    ).toEqual(Object.keys(Prisma.ModelName).sort());
  });

  it('refuses a table the app classifies again', () => {
    expect(() => mergeRlsRegistry({ users: { class: RLS_CLASS.TENANT_NULLABLE } })).toThrow(
      /classified by the foundation and again by the app/,
    );
  });

  describe('the check bites', () => {
    const fixture = (body: string) =>
      `${schema}\nmodel RlsSpecFixture {\n  id Int @id\n${body}\n  @@map("rls_spec_fixtures")\n}\n`;

    it('fails for a new model with no registry entry', () => {
      expect(findRegistryViolations(fixture('  tenantId Int @map("tenant_id")'), FOUNDATION_RLS_REGISTRY)).toEqual([
        'RlsSpecFixture (rls_spec_fixtures) has no entry in the RLS registry',
      ]);
    });

    it('fails when a tenant table loses its tenantId column, or a nullable one is required', () => {
      const registry = {
        ...FOUNDATION_RLS_REGISTRY,
        rls_spec_fixtures: { class: RLS_CLASS.TENANT },
      };
      expect(findRegistryViolations(fixture('  name String'), registry)).toEqual([
        'RlsSpecFixture (rls_spec_fixtures) is tenant but tenantId is missing, expected Int',
      ]);
      const nullable = { ...FOUNDATION_RLS_REGISTRY, rls_spec_fixtures: { class: RLS_CLASS.TENANT_NULLABLE } };
      expect(findRegistryViolations(fixture('  tenantId Int'), nullable)).toEqual([
        'RlsSpecFixture (rls_spec_fixtures) is tenant_nullable but tenantId is Int, expected Int?',
      ]);
    });

    it('fails when a catalog table actually carries a tenantId', () => {
      const registry = { ...FOUNDATION_RLS_REGISTRY, rls_spec_fixtures: { class: RLS_CLASS.CATALOG } };
      expect(findRegistryViolations(fixture('  tenantId Int @map("tenant_id")'), registry)).toEqual([
        'RlsSpecFixture (rls_spec_fixtures) is catalog but has a tenantId column — reclassify it as tenant or tenant_nullable',
      ]);
    });

    it('fails for a stale entry, a child without a tenant parent, and a parent on a class that takes none', () => {
      const registry: Record<string, RlsTableEntry> = {
        ...FOUNDATION_RLS_REGISTRY,
        jobs: { class: RLS_CLASS.TENANT, parent: 'tenants' },
        rls_spec_fixtures: { class: RLS_CLASS.CHILD, parent: 'plan_configs' },
        dropped_table: { class: RLS_CLASS.CATALOG },
      };
      expect(findRegistryViolations(fixture('  name String'), registry).sort()).toEqual(
        [
          'jobs is tenant and must not declare a parent',
          'rls_spec_fixtures is child but its parent plan_configs is not a tenant table',
          'the RLS registry lists dropped_table, which is not a Prisma model table',
        ].sort(),
      );
    });

    it('fails when a declared string tenant column is not a string', () => {
      const registry = {
        ...FOUNDATION_RLS_REGISTRY,
        rls_spec_fixtures: { class: RLS_CLASS.TENANT, stringTenantColumn: 'reason' },
      };
      expect(findRegistryViolations(fixture('  tenantId Int'), registry)).toEqual([
        'RlsSpecFixture (rls_spec_fixtures) is tenant with a string tenant column but tenantId is Int',
      ]);
    });
  });
});
