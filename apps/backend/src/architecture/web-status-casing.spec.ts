import * as fs from 'fs';
import * as path from 'path';

/**
 * WEB status-casing guardrail.
 *
 * Counterpart to `status-call-sites.spec.ts` (which guards the backend). The
 * web app has no equivalent — and because many frontend types declare
 * `status: string` instead of the real enum, TypeScript cannot reject a
 * wrong-case comparison like `doc.status === 'confirmed'` when the API in fact
 * returns the UPPER_SNAKE enum value `'CONFIRMED'`. That exact mismatch shipped
 * the "Rate Confirmation shows in both UPLOADED and MISSING" bug. This test
 * closes the gap from CI: it lives in the backend suite (which runs in the
 * quality gate + every deploy's "Unit tests" step) and scans `apps/web/src`.
 *
 * Source of truth: the generated Prisma enums. We flag a lowercase literal
 * only when it is the lowercase form of a MULTI-WORD UPPER_SNAKE enum value
 * (e.g. PENDING_UPLOAD, IN_PROGRESS, ON_HOLD, NOT_CONFIGURED), sitting next to
 * a `status`/`state` identifier. The multi-word restriction is deliberate:
 * single common words ('paid', 'approved', 'completed', 'error', 'active', …)
 * are legitimately used by local UI state machines and lowercase-by-design
 * derived labels (payStatus), so flagging them is pure noise. Multi-word
 * UPPER_SNAKE values almost never appear as a legit lowercase literal, so they
 * are the high-signal regressions — including the original `pending_upload` /
 * `confirmed` document bug class. Lowercase-by-design schemas that DO use a
 * multi-word value (onboarding 'in_progress', probe 'not_configured', ETA
 * 'at_risk') are allow-listed by file, each with a justification.
 */

const WEB_SRC = path.resolve(__dirname, '../../../web/src');
const SHARED_TYPES_SRC = path.resolve(__dirname, '../../../../packages/shared-types/src');

/**
 * Files exempt from the guardrail. Each entry is a path relative to
 * `apps/web/src`. A trailing `/` matches a directory prefix; otherwise it's an
 * exact file match. Keep this list short and justified.
 */
const ALLOW_LIST: string[] = [
  // Onboarding milestones use a deliberately-lowercase schema
  // (MilestoneStatusSchema = z.enum(['complete','in_progress','available'])).
  'features/platform/onboarding/',
  'app/setup-hub/page.tsx',
  // Command-center ETA status is a lowercase schema ('on_time'|'at_risk'|'late').
  'features/operations/tower/',
  // Platform-services probe status is lowercase by design
  // (z.enum(['success','failed','unsupported','not_configured'])).
  'app/(super-admin)/admin/platform-health/page.tsx',
  // Sally-AI engine simulation types — local lowercase unions, not DB enums.
  'features/platform/ai-chat/engine/',
  // Client-only UI state machines (upload/extract phases, lifecycle rails,
  // tracking timeline, ghost-import cards). These never compare a DB-backed
  // status; they drive local animation/step state and are lowercase by
  // convention across the app.
  'features/fleet/loads/components/ratecon-preview-dialog.tsx',
  'features/fleet/loads/components/LoadLifecycleRail.tsx',
  'features/fleet/loads/types/ratecon.ts',
  'features/fleet/drivers/components/RouteTimeline.tsx',
  'features/fleet/drivers/components/RouteStopCard.tsx',
  'app/driver/trip/components/TripTimeline.tsx',
  'app/track/[token]/page.tsx',
];

/**
 * Tokens that are lowercase by design even on a `status` field — never flag.
 * HOS duty codes are FMCSA 49 CFR 395 wire format (matched by Samsara).
 */
const REGULATORY_LOWERCASE = new Set(['driving', 'on_duty', 'off_duty', 'sleeper']);

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...walk(path.join(dir, entry.name), exts));
    } else if (exts.some((e) => entry.name.endsWith(e)) && !entry.name.endsWith('.d.ts')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Build the set of lowercase tokens that are high-signal regressions, mined
 * from EVERY `z.enum([...])` across shared-types (generated + hand-written):
 *
 *   - `mixedCase` = lowercase form of any value containing an uppercase letter
 *     (i.e. an UPPER_SNAKE enum value that must never be lowercased on the wire)
 *   - `lowercaseByDesign` = values that are ALREADY lowercase in some enum
 *     (payStatus 'paid', milestone 'in_progress', probe 'not_configured', …)
 *
 * A token is suspicious when it is the lowercase form of an UPPER_SNAKE value
 * AND it is NOT also a lowercase-by-design value of some other enum — EXCEPT
 * multi-word tokens, which are kept even if a lowercase-by-design twin exists,
 * because their few legit lowercase homes are covered by the file ALLOW_LIST
 * and the false-positive risk for a multi-word literal is otherwise nil. This
 * keeps single common words ('paid', 'approved', 'active', 'completed', …) out
 * of scope while still catching 'confirmed', 'pending_upload', 'in_transit',
 * 'on_hold', and the rest of the real bug class.
 */
function loadSuspiciousTokens(): Set<string> {
  const mixedCase = new Set<string>();
  const lowercaseByDesign = new Set<string>();
  for (const file of walk(SHARED_TYPES_SRC, ['.ts'])) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/z\.enum\(\[([^\]]*)\]/g)) {
      const values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      for (const v of values) {
        if (/[A-Z]/.test(v)) mixedCase.add(v.toLowerCase());
        else if (/^[a-z][a-z0-9_]*$/.test(v)) lowercaseByDesign.add(v);
      }
    }
  }
  // Multi-word UPPER_SNAKE values only. Single common words ('pending',
  // 'approved', 'error', 'open', 'processing', …) collide with too many legit
  // local UI state machines and derived lowercase display labels to flag by
  // token alone — false positives there would train people to ignore the
  // guard. Multi-word tokens ('pending_upload', 'in_transit', 'on_hold',
  // 'not_configured', …) are the high-signal regressions: a multi-word
  // lowercase status literal is almost always a real wire-format bug. The few
  // legit multi-word lowercase schemas are covered by the file ALLOW_LIST.
  // Single-word fields (e.g. Document.status) are guarded instead by typing
  // them with the real enum so `tsc` rejects a wrong-case comparison.
  const tokens = new Set<string>();
  for (const t of mixedCase) {
    if (REGULATORY_LOWERCASE.has(t)) continue;
    if (t.includes('_') && !lowercaseByDesign.has(t)) tokens.add(t);
  }
  return tokens;
}

function isAllowListed(absPath: string): boolean {
  const rel = path.relative(WEB_SRC, absPath);
  return ALLOW_LIST.some((entry) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry));
}

/**
 * Flag a lowercase literal compared against or assigned to a `status`/`state`
 * identifier when that literal is the lowercase form of a real enum value.
 *   - `<x>status === 'in_progress'`  /  `<x>state !== 'at_risk'`
 *   - `status: 'pending_upload'`     (assignment / where filter)
 */
function scanFile(text: string, suspicious: Set<string>): { line: number; token: string }[] {
  const violations: { line: number; token: string }[] = [];
  const lines = text.split('\n');
  const cmpRe = /\b\w*(?:[Ss]tatus|[Ss]tate)\b\s*(?:===?|!==?)\s*['"]([a-z][a-z0-9_]*)['"]/g;
  const assignRe = /\b(?:status|state|\w+Status|\w+State)\s*:\s*['"]([a-z][a-z0-9_]*)['"]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of [cmpRe, assignRe]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const token = m[1];
        if (suspicious.has(token)) violations.push({ line: i + 1, token });
      }
    }
  }
  return violations;
}

describe('Web status-casing conventions', () => {
  const suspicious = loadSuspiciousTokens();
  const files = walk(WEB_SRC, ['.ts', '.tsx']).filter((f) => !isAllowListed(f));

  it('no web file compares/assigns a lowercase literal that is the lowercase form of an UPPER_SNAKE domain enum value', () => {
    const violations: string[] = [];
    for (const file of files) {
      const hits = scanFile(fs.readFileSync(file, 'utf8'), suspicious);
      for (const h of hits) {
        violations.push(`${path.relative(WEB_SRC, file)}:${h.line} status/state uses lowercase '${h.token}'`);
      }
    }

    if (violations.length) {
      const preview = violations.slice(0, 30).join('\n');
      const more = violations.length > 30 ? `\n… and ${violations.length - 30} more` : '';
      throw new Error(
        `Found ${violations.length} web status-casing violation(s). The API returns the ` +
          `UPPER_SNAKE Prisma enum value; compare against the enum from @app/shared-types ` +
          `(e.g. DocumentStatus.CONFIRMED), not a lowercase literal. If a field is genuinely a ` +
          `lowercase-by-design schema, add its file to ALLOW_LIST with a justification.\n${preview}${more}`,
      );
    }
  });
});
