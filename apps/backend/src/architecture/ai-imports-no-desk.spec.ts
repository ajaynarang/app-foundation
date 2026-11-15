import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * The AI domain never imports Desk. Desk imports AI, never the reverse.
 *
 * Desk is optional (ADR "Optional features: Desk is opt-in at scaffold time"): `init-app --desk no` deletes
 * `domains/desk/`. An AI file that imported it would break every product scaffolded without Desk. Desk reaches AI
 * through what AI exports (the tool pipeline, structured output, embeddings); AI knows Desk only as a principal kind
 * (`desk_responsibility`), which lives in `@appshore/platform`.
 *
 * `optional-features.spec.ts` already refuses a Desk import outside the seam, but lets one through inside a
 * registered `feature:desk` block. This spec allows none under `domains/ai/`, specs and test helpers included: an AI
 * file has no Desk-only line to mark.
 */

const BACKEND_SRC = path.resolve(__dirname, '..');
const DESK_REL = path.join('domains', 'desk');

const IMPORT =
  /(?:\bfrom\s+|\brequire\(\s*|\bjest\.(?:mock|requireActual|doMock)\(\s*|\bimport\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...listFiles(full));
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `file:line -> 'specifier'` under `<srcRoot>/domains/ai` whose specifier reaches `<srcRoot>/domains/desk`. */
function aiImportsOfDesk(srcRoot: string): string[] {
  const aiDir = path.join(srcRoot, 'domains', 'ai');
  const deskDir = path.join(srcRoot, DESK_REL);
  const out: string[] = [];
  for (const file of listFiles(aiDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1];
      const hits = spec.startsWith('.')
        ? (() => {
            const target = path.resolve(path.dirname(file), spec);
            return target === deskDir || target.startsWith(deskDir + path.sep);
          })()
        : /(^|\/)domains\/desk(\/|$)/.test(spec);
      if (hits) {
        const line = text.slice(0, m.index).split('\n').length;
        out.push(`${path.relative(srcRoot, file)}:${line} -> '${spec}'`);
      }
    }
  }
  return out.sort();
}

describe('AI domain: no Desk imports', () => {
  it('no file under domains/ai imports domains/desk', () => {
    expect(aiImportsOfDesk(BACKEND_SRC)).toEqual([]);
  });

  describe('the check catches drift (fixture tree)', () => {
    let root: string;
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-imports-no-desk-'));
      write('domains/desk/desk.module.ts', 'export class DeskModule {}\n');
      write('domains/ai/ai.module.ts', "import { Injectable } from '@nestjs/common';\n");
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('passes a tree where AI does not reach Desk, even when AI names Desk in text', () => {
      write(
        'domains/ai/note.ts',
        "// Desk calls pipeline.run from domains/desk/shared-steps\nconst kind = 'desk_responsibility';\n",
      );
      expect(aiImportsOfDesk(root)).toEqual([]);
    });

    it('fails on every import form: static, side-effect, type, dynamic, require, jest.mock, non-relative', () => {
      write(
        'domains/ai/a.ts',
        [
          "import { DeskModule } from '../desk/desk.module';",
          "import '../desk/desk.module';",
          "import type { X } from '../desk';",
          "const m = await import('../desk/desk.module');",
          "const r = require('../desk/desk.module');",
          "export { DeskModule as D } from '../desk/desk.module';",
        ].join('\n'),
      );
      write('domains/ai/__tests__/b.spec.ts', "jest.mock('../../desk/desk.module');\n");
      write('domains/ai/c.ts', "import { D } from 'src/domains/desk/desk.module';\n");
      expect(aiImportsOfDesk(root)).toEqual([
        "domains/ai/__tests__/b.spec.ts:1 -> '../../desk/desk.module'",
        "domains/ai/a.ts:1 -> '../desk/desk.module'",
        "domains/ai/a.ts:2 -> '../desk/desk.module'",
        "domains/ai/a.ts:3 -> '../desk'",
        "domains/ai/a.ts:4 -> '../desk/desk.module'",
        "domains/ai/a.ts:5 -> '../desk/desk.module'",
        "domains/ai/a.ts:6 -> '../desk/desk.module'",
        "domains/ai/c.ts:1 -> 'src/domains/desk/desk.module'",
      ]);
    });

    it('does not mistake a sibling folder that starts with "desk" for Desk', () => {
      write('domains/desktop/x.ts', 'export const x = 1;\n');
      write('domains/ai/d.ts', "import { x } from '../desktop/x';\n");
      expect(aiImportsOfDesk(root)).toEqual([]);
    });
  });
});
