import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Allow-list for status schemas that are MIRRORS of an external regulatory or
 * vendor enum where the lowercase casing is part of the wire contract. Flipping
 * these would require a translation layer at every integration boundary.
 *
 * Add to this list ONLY with a justification (vendor spec, regulatory cite,
 * etc.) — the goal is to keep the list short and the convention loud.
 */
const REGULATORY_LOWERCASE_ALLOWLIST = new Set<string>([
  // FMCSA Electronic Logging Device (ELD) duty status codes — matches
  // Samsara's `currentDutyStatus` and the FMCSA 49 CFR 395 §11(c)(2) values.
  'HosStatusSchema',
]);

describe('Shared-types status enum conventions', () => {
  const files = walk(SRC_DIR);

  it('every named *Status* (Schema|Enum) z.enum has all UPPER_CASE values', () => {
    const violations: string[] = [];
    const re = /export\s+const\s+(\w*Status\w*(?:Schema|Enum))\s*=\s*z\.enum\(\[([^\]]+)\]\)/g;

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const name = match[1];
        if (REGULATORY_LOWERCASE_ALLOWLIST.has(name)) continue;
        const values = match[2]
          .split(',')
          .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        const bad = values.filter((v) => v !== v.toUpperCase());
        if (bad.length) {
          violations.push(`${path.relative(SRC_DIR, file)} ${name}: [${bad.join(', ')}]`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('every named *_STATUSES const array has all UPPER_CASE values', () => {
    const violations: string[] = [];
    // Match: export const FOO_STATUSES = ['a', 'b'] as const;
    const re = /export\s+const\s+(\w+_STATUSES)\s*=\s*\[([^\]]+)\]\s*as\s+const/g;

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const name = match[1];
        const values = match[2]
          .split(',')
          .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        const bad = values.filter((v) => v !== v.toUpperCase());
        if (bad.length) {
          violations.push(`${path.relative(SRC_DIR, file)} ${name}: [${bad.join(', ')}]`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
