import * as fs from 'fs';
import * as path from 'path';

/**
 * Schema convention guardrail.
 *
 * Every column whose name suggests an enum (`status`, `role`, `type`, etc.)
 * MUST be a Prisma enum, not `String @db.VarChar`. The exception list below
 * is short and load-bearing — each entry is a column where the value space
 * is genuinely open (free-form, tenant-defined, or an extensible registry)
 * and a Prisma enum would impose unwanted rigidity.
 *
 * Adding a new String-typed enum-shaped column without a documented
 * exception fails this test, blocking the PR. Promoting an existing
 * exception to a Prisma enum is a column-promotion task — the entry is
 * removed from the allow-list as part of the same PR.
 */

const SCHEMA_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'foundation', 'db', 'prisma', 'schema');
const readSchema = (): string =>
  fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.prisma'))
    .sort()
    .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'))
    .join('\n');

const ENUM_SHAPED_COLUMN_NAMES = [
  'status',
  'role',
  'type',
  'kind',
  'priority',
  'severity',
  'category',
  'tier',
  'mode',
  'stage',
  'method',
  'channel',
  'scope',
  'level',
];

/**
 * Columns that are intentionally NOT enum-typed. Each entry has a one-line
 * justification — reviewers reject additions without justification.
 *
 * Format: `Model.column → reason`
 */
const ALLOWED_STRING_COLUMNS = new Map<string, string>([
  // Free-form / open-set / extensible-registry columns where a Prisma enum
  // would impose unwanted rigidity:
  ['ReferenceData.category', 'platform reference data — open-set categories defined in seed data'],
  ['Alert.alertType', 'extensible registry — ~50+ alert types declared as constants in code, evolves per feature'],
  ['KnowledgeDocument.category', 'tenant-defined free-form classification of KB documents'],
  ['JobSchedule.category', 'extensible BullMQ job category list — new queues add categories without schema changes'],
  ['AddOn.category', 'admin-curated marketing/grouping tags on the add-ons catalog'],

  // Documented open-set / lowercase-by-design columns. After PR 5a/5b
  // promoted the clean-cut enums, these are the columns that intentionally
  // remain String — each is either an extensible registry, a wire format
  // the platform cannot control, or a tenant-defined classification.
  //
  // Promoting any of these requires a value-space migration, not just an
  // ALTER COLUMN — they are not "TODO future PR" items.
  [
    'Alert.category',
    'extensible registry (schedule | compliance | system | operations | safety | …) — sibling to alertType, evolves per feature',
  ],
  [
    'ConversationMessage.role',
    'lowercase by design — matches LLM provider conventions (assistant | user | system | dispatcher | driver | …); changing it would break wire compatibility with stored conversation history',
  ],
  [
    'Feedback.category',
    'open-set free-form categorization (general | bug | …); some rows have empty-string values that would need cleanup before any promotion',
  ],
  [
    'HitlChallenge.tier',
    'currently lowercase (standard | sensitive); value space owned by the AI hitl module and may grow without schema changes',
  ],
  [
    'ShiftNote.priority',
    'lowercase by design (info | action_required); tied to UI labels and notification routing — promotion would require deciding new value names',
  ],
  [
    'FeatureFlag.category',
    'extensible registry (integration | operations | money | ai | core | developer | …); new categories added as new feature areas land',
  ],
  [
    'Job.category',
    'extensible BullMQ job category list (eld | tms | compliance | accounting | documents | …); sibling to JobSchedule.category which is also open-set',
  ],
  [
    'Job.type',
    'open-set BullMQ job type registry (gps | hos | loads | vehicles | drivers | audit | …); 12+ distinct values today, grows with each new background job',
  ],
  [
    'PlanEntitlement.type',
    'classification registry (software | service | display | limit | …); tenant-billing owned and evolves with plan model',
  ],
]);

interface Violation {
  model: string;
  column: string;
  line: number;
}

function findOwningModel(schema: string, charIndex: number): string {
  const before = schema.slice(0, charIndex);
  const matches = [...before.matchAll(/^model\s+(\w+)\s*\{/gm)];
  return matches.length ? matches[matches.length - 1][1] : '<unknown>';
}

function lineNumberAt(schema: string, charIndex: number): number {
  return schema.slice(0, charIndex).split('\n').length;
}

describe('Prisma schema enum conventions', () => {
  let schema: string;

  beforeAll(() => {
    schema = readSchema();
  });

  it('every enum-shaped column is a Prisma enum (or in ALLOWED_STRING_COLUMNS)', () => {
    // Match: <indent><column-name> String[?] ...anything-on-the-same-line... @db.VarChar
    // Earlier this regex used `[^@\n]*` between `String` and `@db.VarChar`, which
    // silently skipped every column with `@default(...)` or `@map(...)` in between
    // (since those start with `@`). The fix: any non-newline run is fine — we only
    // need to anchor to the same line, not exclude `@`.
    const re = new RegExp(`^\\s+(${ENUM_SHAPED_COLUMN_NAMES.join('|')})\\s+String[?]?[^\\n]*@db\\.VarChar`, 'gm');
    const violations: Violation[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(schema))) {
      const column = match[1];
      const model = findOwningModel(schema, match.index);
      const key = `${model}.${column}`;
      if (!ALLOWED_STRING_COLUMNS.has(key)) {
        violations.push({ model, column, line: lineNumberAt(schema, match.index) });
      }
    }

    if (violations.length > 0) {
      const messages = violations.map(
        (v) =>
          `  - ${v.model}.${v.column} (schema.prisma:${v.line}) — promote to a Prisma enum or add a documented justification to ALLOWED_STRING_COLUMNS in this test.`,
      );
      throw new Error(`Found ${violations.length} String-typed enum-shaped columns:\n${messages.join('\n')}`);
    }
  });
});
