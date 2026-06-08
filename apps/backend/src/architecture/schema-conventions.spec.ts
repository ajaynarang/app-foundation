import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');

describe('Prisma schema conventions', () => {
  let schema: string;

  beforeAll(() => {
    schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
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
