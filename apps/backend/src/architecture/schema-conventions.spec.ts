import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_DIR = path.join(__dirname, '..', '..', '..', '..', 'packages', 'appshore', 'db', 'prisma', 'schema');
const readSchema = (): string =>
  fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.prisma'))
    .sort()
    .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'))
    .join('\n');

describe('Prisma schema conventions', () => {
  let schema: string;

  beforeAll(() => {
    schema = readSchema();
  });

  describe('status columns', () => {
    it('every String-typed status column has an UPPER_CASE @default', () => {
      const re = /^\s+status\s+String[^@\n]*@default\("([^"]+)"\)/gm;
      const violations: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = re.exec(schema))) {
        const def = match[1];
        if (def !== def.toUpperCase()) {
          const before = schema.slice(0, match.index);
          const modelMatches = [...before.matchAll(/^model\s+(\w+)\s*\{/gm)];
          const model = modelMatches.length ? modelMatches[modelMatches.length - 1][1] : '<unknown>';
          violations.push(`${model}.status default = "${def}"`);
        }
      }
      expect(violations).toEqual([]);
    });
  });
});
