/**
 * Schema-drift test.
 *
 * Parses `prisma/schema.prisma` to find every model that is tenant-scoped,
 * either directly (has a `tenantId` field) or indirectly (declared in
 * INDIRECT_MODELS below). Asserts each appears in REGISTRY.
 *
 * When a new tenant-scoped model is added to the schema and NOT registered,
 * this test fails CI with an actionable message.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGISTRY, REGISTERED_TABLES, entriesForMode, type RegistryEntry } from '../registry';
import { INDIRECT_SCOPE_TABLES } from '../core';

const SCHEMA_PATH = resolve(__dirname, '../../../prisma/schema.prisma');

/**
 * Models that are indirectly tenant-scoped: they don't carry `tenantId`
 * directly but belong to a tenant via a parent relation. Each entry lists the
 * model name (PascalCase) and the table name (snake_case).
 *
 * Adding a new indirect-scope model? Add it here AND add a run() entry in the
 * registry.
 */
const INDIRECT_MODELS: ReadonlyArray<{ model: string; table: string }> = [
  { model: 'AlertNote', table: 'alert_notes' },
  { model: 'SettlementLineItem', table: 'settlement_line_items' },
  { model: 'SettlementDeduction', table: 'settlement_deductions' },
  { model: 'InvoiceLineItem', table: 'invoice_line_items' },
  { model: 'RouteEvent', table: 'route_events' },
  { model: 'RoutePlanLoad', table: 'route_plan_loads' },
  { model: 'RouteSegment', table: 'route_segments' },
  { model: 'LoadStop', table: 'load_stops' },
  { model: 'LoadCharge', table: 'load_charges' },
  { model: 'LoadNote', table: 'load_notes' },
  { model: 'LoadEvent', table: 'load_events' },
  { model: 'RecurringLaneStop', table: 'recurring_lane_stops' },
  { model: 'ConversationMessage', table: 'conversation_messages' },
  { model: 'DriverPreferences', table: 'driver_preferences' },
  { model: 'UserPreferences', table: 'user_preferences' },
  { model: 'PushSubscription', table: 'push_subscriptions' },
  { model: 'ApiKey', table: 'api_keys' },
  { model: 'RefreshToken', table: 'refresh_tokens' },
  { model: 'SuperAdminPreferences', table: 'super_admin_preferences' },
  { model: 'OAuthAccessToken', table: 'oauth_access_tokens' },
  { model: 'OAuthRefreshToken', table: 'oauth_refresh_tokens' },
  { model: 'OAuthAuthorizationCode', table: 'oauth_authorization_codes' },
  { model: 'WebhookDeliveryLog', table: 'webhook_delivery_logs' },
  { model: 'SupportTicketMessage', table: 'support_ticket_messages' },
  { model: 'DeskEpisodeStep', table: 'desk_episode_steps' },
  { model: 'DeskApproval', table: 'desk_approvals' },
  { model: 'EmailIngestAttachment', table: 'email_ingest_attachments' },
  { model: 'EmailIngestMessage', table: 'email_ingest_messages' },
];

/**
 * Indirect models that cascade automatically from a parent that IS registered
 * AND have no data worth counting separately. These don't need their own
 * registry entry — the cascade handles them.
 *
 * Every entry here is a claim: "when parent X is deleted, this child cascades
 * via onDelete: Cascade." The test verifies the cascade declaration exists.
 */
const CASCADE_ONLY: ReadonlyArray<{
  model: string;
  table: string;
  parent: string;
}> = [
  {
    model: 'DeskEpisodeStep',
    table: 'desk_episode_steps',
    parent: 'DeskEpisode',
  },
  { model: 'DeskApproval', table: 'desk_approvals', parent: 'DeskEpisode' },
  {
    model: 'EmailIngestAttachment',
    table: 'email_ingest_attachments',
    parent: 'EmailIngestMessage',
  },
  {
    model: 'EmailIngestMessage',
    table: 'email_ingest_messages',
    parent: 'EmailIngestThread',
  },
];

/**
 * Models present in schema but never tenant-scoped — global reference data.
 * Listed here to make the exclusion explicit (the test prints this list when
 * asserting coverage so a reader understands why they were skipped).
 */
const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  'Tenant',
  'JobSchedule',
  'Stop',
  'ReferenceData',
  'FuelCardType',
  'BrandFuelCardAcceptance',
  'IftaTaxRate',
  'PlanConfig',
  'PlanEntitlement',
  'AddOn',
  'VendorConfig',
  'Lead',
  'Announcement',
  'FeatureFlag',
  'ProcessedBillingEvent',
  'Event',
  'Trip',
  'KnowledgeDocument',
]);

/**
 * Parses a schema.prisma file and returns every model name mapped to its body.
 *
 * A model block starts with `^model <Name> {` and extends to the matching
 * closing brace. We can't use a naive `[^}]*` because bodies can contain
 * default values and attribute arguments with braces.
 */
function parseModels(source: string): Map<string, string> {
  const models = new Map<string, string>();
  const headerRe = /^model\s+(\w+)\s*\{/gm;
  let header: RegExpExecArray | null;
  while ((header = headerRe.exec(source)) !== null) {
    const name = header[1];
    const bodyStart = header.index + header[0].length;
    // Walk forward, tracking brace depth. Start at depth 1 (the `{` we just consumed).
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    models.set(name, source.slice(bodyStart, i - 1));
  }
  return models;
}

function extractTableName(modelName: string, body: string): string {
  const mapMatch = body.match(/@@map\s*\(\s*"([^"]+)"\s*\)/);
  if (mapMatch) return mapMatch[1];
  return modelName.toLowerCase();
}

function hasTenantIdField(body: string): boolean {
  return /^\s*tenantId\s+/m.test(body);
}

describe('Tenant reset registry schema-drift', () => {
  const source = readFileSync(SCHEMA_PATH, 'utf-8');
  const models = parseModels(source);

  it('parses at least 100 models from schema.prisma', () => {
    expect(models.size).toBeGreaterThanOrEqual(100);
  });

  it('every direct tenant-scoped model is registered', () => {
    const unregistered: string[] = [];

    for (const [modelName, body] of models) {
      if (!hasTenantIdField(body)) continue;
      if (GLOBAL_MODELS.has(modelName)) continue;
      const tableName = extractTableName(modelName, body);
      if (!REGISTERED_TABLES.has(tableName)) {
        unregistered.push(`${modelName} (${tableName})`);
      }
    }

    if (unregistered.length > 0) {
      throw new Error(
        `The following tenant-scoped models have a tenantId field but are NOT ` +
          `registered in scripts/tenant-reset/registry.ts:\n\n` +
          unregistered.map((s) => `  - ${s}`).join('\n') +
          '\n\nAdd each to REGISTRY with a category, soft flag, and run() fn, ' +
          'then re-run this test.\n\n' +
          'If the model is deliberately global (not tenant-scoped), add it to ' +
          'GLOBAL_MODELS in this test.',
      );
    }
  });

  it('every indirect tenant-scoped model is either registered or cascade-only', () => {
    const missing: string[] = [];
    for (const { model, table } of INDIRECT_MODELS) {
      const isRegistered = REGISTERED_TABLES.has(table);
      const isCascadeOnly = CASCADE_ONLY.some((c) => c.table === table);
      if (!isRegistered && !isCascadeOnly) {
        missing.push(`${model} (${table})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('registered tables exist in the schema (catches renames)', () => {
    const schemaTables = new Set<string>();
    for (const [modelName, body] of models) {
      schemaTables.add(extractTableName(modelName, body));
    }

    // `tenants` is added by hard-mode Tenant deletion in core.ts but not in
    // REGISTRY; everything else should resolve. Also excludes "tenants" row
    // from REGISTERED_TABLES since it's handled outside the registry.
    const missing = [...REGISTERED_TABLES].filter((t) => !schemaTables.has(t));
    expect(missing).toEqual([]);
  });

  it('cascade-only models declare onDelete: Cascade from their parent', () => {
    for (const { model, parent } of CASCADE_ONLY) {
      const body = models.get(model);
      expect(body).toBeDefined();
      // Simple check: the model body references the parent with `onDelete: Cascade`.
      const pattern = new RegExp(`${parent}\\s+@relation[^)]*onDelete:\\s*Cascade`, 'ms');
      expect(body).toMatch(pattern);
    }
  });

  it('indirect-scope registry entries have a count predicate in core.ts', () => {
    const indirectEntries = REGISTRY.filter((e) => typeof e.scope === 'function');
    const missing = indirectEntries.map((e) => e.table).filter((table) => !INDIRECT_SCOPE_TABLES.includes(table));
    expect(missing).toEqual([]);
  });

  it('every registry entry has a valid category', () => {
    for (const entry of REGISTRY) {
      expect(typeof entry.category).toBe('string');
      expect(entry.category.length).toBeGreaterThan(0);
    }
  });

  it('every registry entry has a unique table name', () => {
    const seen = new Set<string>();
    for (const entry of REGISTRY) {
      expect(seen.has(entry.table)).toBe(false);
      seen.add(entry.table);
    }
  });

  it('soft mode excludes keep entries but includes wipe and reset', () => {
    const softEntries = entriesForMode('soft');
    const hardEntries = entriesForMode('hard');

    expect(hardEntries).toBe(REGISTRY);
    expect(softEntries.length).toBeLessThan(hardEntries.length);

    const softTables = new Set(softEntries.map((e: RegistryEntry) => e.table));
    // Fleet entities must NOT be in soft mode
    expect(softTables.has('drivers')).toBe(false);
    expect(softTables.has('vehicles')).toBe(false);
    expect(softTables.has('trailers')).toBe(false);
    // Users must NOT be in soft mode
    expect(softTables.has('users')).toBe(false);
    // But alerts MUST be
    expect(softTables.has('alerts')).toBe(true);
    expect(softTables.has('loads')).toBe(true);
  });
});
