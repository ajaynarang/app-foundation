import * as fs from 'fs';
import * as path from 'path';

/**
 * The AI domain never switches to the `ai_reader` role.
 *
 * The old AI RLS wrapper opened a transaction around every tool call and ran `SET LOCAL ROLE
 * ai_reader`. No tool used that transaction's client, so the role's policies applied to nothing,
 * and each call held a second pooled connection. It was removed; tenant isolation is the tools'
 * own `tenantId` filters. This spec keeps the wrapper from coming back: no file under
 * `domains/ai/` (code or spec) may mention the role or switch roles, and the `rls/` folder stays
 * gone. Real row-level security, if a product adds it, arrives with tenant-context plumbing and
 * its own roles, not through this wrapper.
 */

const AI_DIR = path.resolve(__dirname, '..', 'domains', 'ai');
const FORBIDDEN = [/SET\s+LOCAL\s+ROLE/i, /ai_reader/];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx|js|json|md|sql)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('AI domain: no ai_reader role switch', () => {
  it('no file under domains/ai mentions SET LOCAL ROLE or ai_reader', () => {
    const offenders: string[] = [];
    for (const file of listFiles(AI_DIR)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${path.relative(AI_DIR, file)} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the dead RLS wrapper folder domains/ai/rls does not exist', () => {
    expect(fs.existsSync(path.join(AI_DIR, 'rls'))).toBe(false);
  });
});
