import * as fs from 'fs';
import * as path from 'path';

/**
 * Desk is a plan feature (`desk`): every Desk controller a person calls carries `@RequireFeature(FEATURE_KEYS.DESK)`
 * on the class and opts no handler out. The Inngest serve endpoint does not: it is the engine's own signed callback,
 * with no signed-in user. Read as text, because loading the Desk controllers pulls in the Inngest ESM client. Lives in
 * the Desk folder so it goes with Desk.
 */
const DESK = path.resolve(__dirname, '..', '..');
const UNGATED = new Set(['InngestController']);

function controllers(): Array<{ file: string; name: string; text: string }> {
  const out: Array<{ file: string; name: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.controller.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        const name = text.match(/export class (\w+)/)?.[1];
        if (name) out.push({ file: path.relative(DESK, full), name, text });
      }
    }
  };
  walk(DESK);
  return out;
}

/** The decorators stacked right above `export class`. */
const classDecorators = (text: string): string =>
  text.match(/((?:@[\w.]+\((?:[^()]|\([^()]*\))*\)\s*)+)export class/)?.[1] ?? '';

describe('Desk routes are plan-gated by desk', () => {
  const all = controllers();

  it('finds the Desk controllers', () => {
    expect(all.length).toBeGreaterThan(UNGATED.size);
  });

  it.each(all.filter((c) => !UNGATED.has(c.name)).map((c) => [c.name, c]))(
    '%s needs desk on every route',
    (_name, c) => {
      expect(classDecorators(c.text)).toContain('@RequireFeature(FEATURE_KEYS.DESK)');
      expect(c.text).not.toContain('@NoFeatureGate(');
    },
  );

  it('leaves the Inngest serve endpoint ungated', () => {
    const inngest = all.find((c) => c.name === 'InngestController');
    expect(inngest).toBeDefined();
    expect(inngest.text).not.toContain('@RequireFeature(');
  });
});
