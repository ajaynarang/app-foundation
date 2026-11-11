import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/**
 * The ID boundary (ADR "ID boundary"): an Int primary key never crosses the API. A request names a record by
 * its public id and the service resolves it; a response and an event payload carry the public id.
 *
 * This spec reads four surfaces and fails when one takes or shows a numeric id:
 *
 * - `DTOS`           every `dto/` folder under the app's and the platform's domains: a property named `id`,
 *                    `*Id` or `*Ids` typed `number`;
 * - `ROUTE_PARAMS`   every controller: a route param parsed with `ParseIntPipe`;
 * - `MCP_TOOLS`      every `*.tool.ts` under the AI domain: an id parameter declared `z.number()`;
 * - `SHARED_TYPES`   every schema in `@app/shared-types`: an `id` / `*Id` field declared `z.number()`.
 *
 * The numeric ids that exist today are listed in `id-boundary.allowlist.json`, one entry per file, with the
 * count the file holds and the reason it has not moved. The list may only shrink: an unlisted file, or one more
 * numeric id in a listed file, fails. So does an entry for a file that has since been fixed: lower its count,
 * or remove it.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const ALLOWLIST_PATH = join(__dirname, 'id-boundary.allowlist.json');
const SECTIONS = ['DTOS', 'ROUTE_PARAMS', 'MCP_TOOLS', 'SHARED_TYPES'] as const;
type Section = (typeof SECTIONS)[number];
type Allowlist = Record<Section, Record<string, { count: number; reason: string }>>;

const ALLOWLIST: Allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));

const APP_DOMAINS = join(REPO, 'apps', 'backend', 'src', 'domains');
const APP_SRC = join(REPO, 'apps', 'backend', 'src');
const PLATFORM_SRC = join(REPO, 'packages', 'appshore', 'platform', 'src');
const PLATFORM_DOMAINS = join(PLATFORM_SRC, 'domains');
const AI_DOMAIN = join(APP_DOMAINS, 'ai');
const SHARED_TYPES = join(REPO, 'packages', 'shared-types', 'src');

function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === '__tests__' || name === 'generated') return [];
    if (statSync(path).isDirectory()) return walk(path, keep);
    return keep(path) ? [path] : [];
  });
}

const isSource = (file: string) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts');
const rel = (file: string) => relative(REPO, file);

const ID_NAME = /^(?:id|\w+Ids?)$/;

/** How many class properties in a DTO file are named like an id and typed `number` (or `number[]`). */
export function numericIdProperties(source: string): string[] {
  const file = ts.createSourceFile('dto.ts', source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  file.forEachChild(function visit(node) {
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name) && ID_NAME.test(node.name.text) && node.type) {
      const type = node.type.getText().replace(/\s/g, '');
      if (/^number(\[\])?(\|null|\|undefined)*$/.test(type) || type === 'Array<number>') found.push(node.name.text);
    }
    node.forEachChild(visit);
  });
  return found;
}

/** Route params parsed as an integer: `@Param('x', ParseIntPipe)`. */
export function intRouteParams(source: string): string[] {
  return [...source.matchAll(/@Param\(\s*'([^']+)'\s*,\s*(?:new\s+)?ParseIntPipe\b/g)].map((m) => m[1]);
}

/** An id parameter or field declared as a Zod number: `tenantId: z.number()`, `id: z.coerce.number()`. */
export function zodNumericIds(source: string): string[] {
  return [...source.matchAll(/\b(id|\w+Ids?)\s*:\s*z\.(?:coerce\.)?number\(\)/g)].map((m) => m[1]);
}

const SCANS: Record<Section, { files: () => string[]; find: (source: string) => string[]; what: string }> = {
  DTOS: {
    files: () => [APP_DOMAINS, PLATFORM_DOMAINS].flatMap((root) => walk(root, (f) => isSource(f) && /\/dto\//.test(f))),
    find: numericIdProperties,
    what: 'a DTO property named like an id and typed number',
  },
  ROUTE_PARAMS: {
    files: () => [APP_SRC, PLATFORM_SRC].flatMap((root) => walk(root, (f) => f.endsWith('.controller.ts'))),
    find: intRouteParams,
    what: 'a route param parsed with ParseIntPipe',
  },
  MCP_TOOLS: {
    files: () => walk(AI_DOMAIN, (f) => f.endsWith('.tool.ts')),
    find: zodNumericIds,
    what: 'a tool id parameter declared z.number()',
  },
  SHARED_TYPES: {
    files: () => walk(SHARED_TYPES, isSource),
    find: zodNumericIds,
    what: 'a schema id field declared z.number()',
  },
};

describe('ID boundary: an Int primary key never crosses the API', () => {
  describe.each(SECTIONS)('%s', (section) => {
    const scan = SCANS[section];
    const listed = ALLOWLIST[section] ?? {};
    const counts = new Map(
      scan
        .files()
        .map((file) => [rel(file), scan.find(readFileSync(file, 'utf8'))] as const)
        .filter(([, ids]) => ids.length > 0),
    );

    it('scans real files (a glob that matches nothing would pass by vacuity)', () => {
      expect(scan.files().length).toBeGreaterThan(0);
    });

    it(`no unlisted file holds ${scan.what}`, () => {
      const unlisted = [...counts.entries()]
        .filter(([file]) => !(file in listed))
        .map(([file, ids]) => `${file}: ${ids.join(', ')}`);
      if (unlisted.length > 0) {
        throw new Error(
          `A numeric id at the API boundary. Name the record by its public id and resolve it in the service ` +
            `(ADR "ID boundary"):\n  ${unlisted.join('\n  ')}`,
        );
      }
    });

    it('no listed file gained a numeric id (the list may only shrink)', () => {
      const grown = [...counts.entries()]
        .filter(([file, ids]) => file in listed && ids.length > listed[file].count)
        .map(([file, ids]) => `${file}: lists ${listed[file].count}, holds ${ids.length} (${ids.join(', ')})`);
      expect(grown).toEqual([]);
    });

    it('every entry still matches its file (a fixed file lowers its count or leaves the list)', () => {
      const stale = Object.entries(listed)
        .filter(([file, entry]) => (counts.get(file)?.length ?? 0) !== entry.count)
        .map(([file, entry]) => `${file}: lists ${entry.count}, holds ${counts.get(file)?.length ?? 0}`);
      expect(stale).toEqual([]);
    });

    it('every entry says why the id has not moved', () => {
      const unexplained = Object.entries(listed)
        .filter(([, entry]) => typeof entry.reason !== 'string' || entry.reason.trim().length < 20)
        .map(([file]) => file);
      expect(unexplained).toEqual([]);
    });
  });

  it('the allowlist holds exactly the known sections', () => {
    expect(Object.keys(ALLOWLIST).sort()).toEqual([...SECTIONS].sort());
  });

  describe('the scanners (sanity)', () => {
    it('sees a numeric id property, and not a string id or a number that is not an id', () => {
      const dto = `
        export class ExampleDto {
          @IsInt() tenantId?: number;
          @IsInt({ each: true }) memberIds!: number[];
          @IsString() projectId!: string;
          @IsInt() quantity!: number;
          @IsUUID() id!: string;
        }`;
      expect(numericIdProperties(dto)).toEqual(['tenantId', 'memberIds']);
    });

    it('sees an Int route param, and not a uuid or string one', () => {
      const controller = `
        get(@Param('job_id', ParseIntPipe) jobId: number) {}
        one(@Param('id', ParseUUIDPipe) id: string) {}
        other(@Param('client_id') clientId: string) {}`;
      expect(intRouteParams(controller)).toEqual(['job_id']);
    });

    it('sees a Zod numeric id, and not a string id or a count', () => {
      const schema = `z.object({ id: z.number(), userId: z.coerce.number(), publicId: z.string(), total: z.number() })`;
      expect(zodNumericIds(schema)).toEqual(['id', 'userId']);
    });

    it('the lists that moved to public ids hold no numeric id: broadcasts and feedback', () => {
      const moved = [
        'packages/appshore/platform/src/domains/announcements/announcements.controller.ts',
        'apps/backend/src/domains/feedback/feedback-admin.controller.ts',
      ];
      for (const file of moved) expect(intRouteParams(readFileSync(join(REPO, file), 'utf8'))).toEqual([]);
      expect(zodNumericIds(readFileSync(join(SHARED_TYPES, 'platform', 'feedback.schema.ts'), 'utf8'))).toEqual([]);
    });
  });
});
