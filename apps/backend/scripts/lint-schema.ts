/**
 * Schema linter — enforces SALLY ID + column naming convention.
 * See .claude/skills/sally-backend-patterns/id-convention.md
 *     .claude/skills/sally-backend-patterns/column-naming.md
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface LintViolation {
  rule: string;
  model: string;
  field?: string;
  message: string;
}

export interface LintOptions {
  /** Allowlist entries shaped "Model.field:rule" or "Model:rule" — used to grandfather pre-existing violations. */
  allowlist?: string[];
}

/** Audit/event/log table name patterns — these MUST use UUIDv7, not UUIDv4 or CUID. */
const AUDIT_NAME_PATTERNS = [
  /Episode$/,
  /Step$/,
  /Approval$/,
  /Memory$/,
  /Audit$/,
  /AuditLog$/,
  /Finding$/,
  /Log$/,
  /Event$/,
];

/** Field-name patterns that look like opaque tokens. */
const TOKEN_FIELD_PATTERNS = [/Token$/, /Secret$/, /^apiKey$/, /^accessKey$/, /^refreshToken$/];

/** Tables that legitimately store tokens because they ARE token tables. */
const KNOWN_TOKEN_TABLES = new Set([
  'OAuthAccessToken',
  'OAuthRefreshToken',
  'ApiKey',
  'PasswordReset',
  'LoadShareLink',
  'ConversationSession',
]);

/** Tables that don't need tenant scoping (global reference data, the Tenant table itself). */
const TENANT_SCOPING_EXEMPT = new Set([
  'Tenant',
  'PlanConfig',
  'PlanEntitlement',
  'FeatureFlag',
  'FuelCardType',
  'BrandFuelCardAcceptance',
  // ModelPricing holds provider/model rates that apply globally — same rate
  // for every tenant. Per-tenant routing or per-tenant pricing would belong
  // on a separate join table, not on the pricing snapshot itself.
  'ModelPricing',
]);

interface ParsedField {
  name: string;
  type: string;
  attrs: string[];
  fullLine: string;
}

interface ParsedModel {
  name: string;
  fields: ParsedField[];
}

export function lintSchema(schemaText: string, opts: LintOptions = {}): LintViolation[] {
  const violations: LintViolation[] = [];
  const allow = new Set(opts.allowlist ?? []);
  const isAllowed = (model: string, rule: string, field?: string): boolean =>
    allow.has(`${model}.${field ?? '*'}:${rule}`) || allow.has(`${model}:${rule}`);

  for (const block of parseModelBlocks(schemaText)) {
    const { name, fields } = block;
    let hasTenantId = false;

    for (const f of fields) {
      if (f.name === 'tenantId') hasTenantId = true;

      if (f.fullLine.includes('@default(cuid()')) {
        if (!isAllowed(name, 'no-cuid', f.name)) {
          violations.push({
            rule: 'no-cuid',
            model: name,
            field: f.name,
            message: 'CUID is banned. Use Int autoincrement (operational) or UUIDv7 (audit/event).',
          });
        }
      }

      const isAuditTable = AUDIT_NAME_PATTERNS.some((p) => p.test(name));
      if (isAuditTable && f.fullLine.includes('@default(uuid()')) {
        if (!isAllowed(name, 'audit-needs-uuidv7', f.name)) {
          violations.push({
            rule: 'audit-needs-uuidv7',
            model: name,
            field: f.name,
            message: 'Audit/event tables must use UUIDv7, not UUIDv4.',
          });
        }
      }

      const refMatch = f.fullLine.match(/references:\s*\[([^\]]+)\]/);
      if (refMatch && refMatch[1].trim() !== 'id') {
        if (!isAllowed(name, 'fk-must-target-id', f.name)) {
          violations.push({
            rule: 'fk-must-target-id',
            model: name,
            field: f.name,
            message: `FK must target id; targets [${refMatch[1]}].`,
          });
        }
      }

      const looksLikeToken = TOKEN_FIELD_PATTERNS.some((p) => p.test(f.name));
      if (looksLikeToken && !KNOWN_TOKEN_TABLES.has(name)) {
        if (!isAllowed(name, 'no-embedded-token', f.name)) {
          violations.push({
            rule: 'no-embedded-token',
            model: name,
            field: f.name,
            message: `Token field on operational row. Move to a dedicated *ShareLink/*Token/*Key table.`,
          });
        }
      }

      if (/_/.test(f.name)) {
        if (!isAllowed(name, 'naming-camelcase', f.name)) {
          violations.push({
            rule: 'naming-camelcase',
            model: name,
            field: f.name,
            message: `Prisma field names must be camelCase. Use @map for snake_case columns.`,
          });
        }
      }

      if (/^DateTime\b/.test(f.type) && !/(At|Date)$/.test(f.name)) {
        if (!isAllowed(name, 'datetime-suffix', f.name)) {
          violations.push({
            rule: 'datetime-suffix',
            model: name,
            field: f.name,
            message: `DateTime fields must end in At (timestamp) or Date (calendar date).`,
          });
        }
      }
    }

    if (!hasTenantId && !TENANT_SCOPING_EXEMPT.has(name)) {
      if (!isAllowed(name, 'tenant-scoping-missing')) {
        violations.push({
          rule: 'tenant-scoping-missing',
          model: name,
          message: `Tenant-scoped table is missing tenantId.`,
        });
      }
    }
  }

  return violations;
}

function parseModelBlocks(text: string): ParsedModel[] {
  const result: ParsedModel[] = [];
  // Match `model Name { ... }` non-greedy. Tolerate leading indentation in tests
  // and the unindented form used in real schema.prisma.
  const re = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, name, body] = m;
    const fields: ParsedField[] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;
      if (line.startsWith('@@')) continue;
      const tokens = line.split(/\s+/);
      const [fieldName, fieldType, ...rest] = tokens;
      if (!fieldName || !fieldType) continue;
      if (fieldName.startsWith('@@')) continue;
      fields.push({
        name: fieldName,
        type: fieldType,
        attrs: rest,
        fullLine: line,
      });
    }
    result.push({ name, fields });
  }
  return result;
}

if (require.main === module) {
  const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
  const text = readFileSync(schemaPath, 'utf8');
  const allowlistPath = resolve(process.cwd(), 'scripts/lint-schema.allowlist');
  let allowlist: string[] = [];
  try {
    allowlist = readFileSync(allowlistPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    // No allowlist file — fine.
  }
  const violations = lintSchema(text, { allowlist });
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`[${v.rule}] ${v.model}${v.field ? '.' + v.field : ''}: ${v.message}`);
    }
    console.error(`\n${violations.length} schema violation(s).`);
    process.exit(1);
  }
  console.log('schema OK');
}
