import * as fs from 'fs';
import * as path from 'path';

const BACKEND_SRC = path.join(__dirname, '..');

/**
 * Files / paths exempt from the guardrail. Each entry must come with a
 * justification — the goal is to keep the list short and the convention loud.
 */
const ALLOW_LIST = [
  // Tracking timeline emits lowercase UI labels for the public tracking
  // page — synthesized state, not a DB column status.
  'domains/fleet/loads/services/load-tracking.service.ts',
  // payStatus is a derived UI label (lowercase) computed from settlement
  // statuses — not a DB column.
  'domains/fleet/loads/services/load-query.service.ts',
  // HOS regulatory codes — FMCSA 49 CFR 395 §11(c)(2) wire format,
  // matched by Samsara. See packages/shared-types/__tests__/status-conventions.spec.ts
  // REGULATORY_LOWERCASE_ALLOWLIST.
  'domains/operations/command-center/command-center.types.ts',
  'domains/operations/command-center/services/overview.service.ts',
  'domains/operations/alerts/alert-types.ts',
  'domains/operations/monitoring/checks/hos/hos-violation.check.ts',
  'domains/integrations/adapters/eld/samsara-eld.adapter.ts',
  'domains/integrations/adapters/eld/eld-adapter.interface.ts',
  // Convention test infrastructure itself.
  'architecture/',
  // MCP tool input enum exposed to the LLM ('active'/'assigned'/'unassigned').
  // The lowercase values are tool-API param tokens; the actual Prisma write
  // at line 145 maps to 'ACTIVE'.
  'domains/ai/mcp/tools/comms-bulk-drivers.tool.ts',
  // External vendor status comparisons (not DB columns):
  //   - email-intake.service: function-return shape `{ status: 'approved', … }`
  //   - twilio-verify.service: comparing Twilio API verificationCheck.status
  //   - hos-sync.service: ELD sync attempt status (Job.status fixed; remaining
  //     value is in retry-loop logic that is internal sync state)
  'domains/integrations/email-intake/services/email-intake.service.ts',
  'infrastructure/sms/twilio-verify.service.ts',
];

/**
 * Lowercase tokens that, if found near a `status` field, indicate drift on
 * one of the 16 migrated tables. We deliberately list tokens (not regex
 * fragments) so allow-listed values like 'driving'/'on_duty' don't trigger.
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
 * literals that would target one of the 16 migrated tables. Patterns:
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
