import * as fs from 'fs';
import * as path from 'path';

const BACKEND_SRC = path.join(__dirname, '..');

/**
 * Files / paths exempt from the guardrail. Each entry must come with a
 * justification — the goal is to keep the list short and the convention loud.
 * Typical legitimate exemptions: derived lowercase UI labels (not DB columns)
 * and comparisons against an external vendor API's lowercase wire format.
 */
const ALLOW_LIST = [
  // Convention test infrastructure itself.
  'architecture/',
  // External vendor status comparison (not a DB column): comparing the
  // Twilio API's verificationCheck.status ('approved', 'pending', …).
  'infrastructure/sms/twilio-verify.service.ts',
];

/**
 * Lowercase tokens that, if found near a `status` field, indicate drift from
 * the UPPER_SNAKE Prisma-enum convention. We deliberately list tokens (not
 * regex fragments) so legitimately-lowercase values never trigger.
 */
const SUSPICIOUS_LOWERCASE_TOKENS = new Set<string>([
  'pending',
  'assigned',
  'in_transit',
  'on_hold',
  'delivered',
  'cancelled',
  'arrived',
  'in_progress',
  'completed',
  'auto_resolved',
  'snoozed',
  'acknowledged',
  'resolved',
  'requested',
  'approved',
  'denied',
  'used',
  'expired',
  'submitted',
  'queued',
  'processing',
  'failed',
  'pending_upload',
  'confirmed',
  'deleted',
  'declined',
  'suspended',
  'planned',
  'superseded',
  'skipped',
  'running',
  'succeeded',
  'gated',
  'waiting_approval',
  'escalated',
  'rejected_by_operator',
  'paused',
  'reviewed',
  'draft',
  'active',
]);

function walk(dir: string, exts = ['.ts']): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      out.push(...walk(path.join(dir, entry.name), exts));
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e)) && !entry.name.endsWith('.spec.ts')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function isAllowListed(absPath: string): boolean {
  const rel = path.relative(BACKEND_SRC, absPath);
  return ALLOW_LIST.some((entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry));
}

/**
 * Find lowercase status assignments / comparisons / Prisma where-clause
 * literals that would target an UPPER_SNAKE Prisma status column. Patterns:
 *   - `status: 'pending'`             (write or where filter)
 *   - `status === 'pending'`          (comparison)
 *   - `status: { in: ['pending', …] }` (Prisma where IN)
 *   - `status: { not: 'pending' }`    (Prisma where NOT)
 */
function scanFile(text: string): { line: number; token: string }[] {
  const violations: { line: number; token: string }[] = [];
  const lines = text.split('\n');

  // Combined regex captures the lowercase token in either a write/where
  // assignment or a comparison. Group 1 = assignment, Group 2 = comparison,
  // Group 3 = "in" array element, Group 4 = "not" value.
  const re =
    /\bstatus\s*:\s*['"]([a-z][a-z_]*)['"]|\bstatus\s*===?\s*['"]([a-z][a-z_]*)['"]|\bstatus\s*:\s*\{\s*(?:in|notIn)\s*:\s*\[([^\]]+)\]|\bstatus\s*:\s*\{\s*not\s*:\s*['"]([a-z][a-z_]*)['"]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const tokens: string[] = [];
      if (m[1]) tokens.push(m[1]);
      if (m[2]) tokens.push(m[2]);
      if (m[3]) tokens.push(...m[3].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')));
      if (m[4]) tokens.push(m[4]);

      for (const t of tokens) {
        if (SUSPICIOUS_LOWERCASE_TOKENS.has(t)) {
          violations.push({ line: i + 1, token: t });
        }
      }
    }
  }
  return violations;
}

describe('Backend status call-site conventions', () => {
  const files = walk(BACKEND_SRC).filter((f) => !isAllowListed(f));

  it('no service / controller / processor file writes or compares lowercase against a migrated status column', () => {
    const violations: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const hits = scanFile(text);
      if (hits.length) {
        const rel = path.relative(BACKEND_SRC, file);
        for (const h of hits) {
          violations.push(`${rel}:${h.line} status uses lowercase '${h.token}'`);
        }
      }
    }

    // Pretty error: list first 30 violations so failures are diagnostic.
    if (violations.length) {
      const preview = violations.slice(0, 30).join('\n');
      const more = violations.length > 30 ? `\n… and ${violations.length - 30} more` : '';
      throw new Error(`Found ${violations.length} lowercase status call-sites:\n${preview}${more}`);
    }
  });
});
