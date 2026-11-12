import * as fs from 'fs';
import * as path from 'path';

/**
 * Text helpers for the architecture specs that read source as text (`model-id-literals.spec.ts`,
 * `model-calls-name-a-ceiling.spec.ts`). Not a spec itself.
 */

/** Every non-spec `.ts` file under `dir`, skipping `node_modules`, `__tests__` and `__fixtures__`. */
export function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__fixtures__') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.ts$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Remove `//` and `/* *\/` comments so text named in prose does not count; string contents are kept. A heuristic:
 * it does not parse regex literals, which is enough for the patterns these specs look for.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += source[i++];
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') out += source[i++];
        out += source[i++];
      }
      out += source[i++] ?? '';
    } else {
      out += source[i++];
    }
  }
  return out;
}
