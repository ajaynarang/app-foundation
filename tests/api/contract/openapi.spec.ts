import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/auth.fixture.js';
import { ENV } from '../../config/test-env.js';

/**
 * The served contract is the committed one, and real responses are what it says (ADR "API contract", section 4).
 *
 * `swagger-completeness.spec.ts` holds the committed `apps/backend/openapi.json` to the code. This holds a running
 * backend to that file, two ways:
 *
 * 1. `/api/openapi.json` equals the committed file, `servers` aside (the served copy names its own origin). The
 *    suite runs against a local, non-production backend, which serves the full document; a production process
 *    serves `public-openapi.json` instead (held by `swagger-completeness.spec.ts`).
 * 2. Every GET the document lists with no path param and no required query param is called as the owner and, when
 *    the owner may not call it, as the super admin, and each 200 body is checked against the response schema the
 *    file publishes for it. A schema that does not match what the route sends fails here.
 */
const COMMITTED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'backend', 'openapi.json');

type Schema = {
  $ref?: string;
  type?: string;
  nullable?: boolean;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: Schema | boolean;
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
};
type Operation = {
  operationId: string;
  parameters?: Array<{ in: string; required?: boolean }>;
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>;
};
type Document = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } };

/** Where a body breaks the schema, one line per problem (empty when it conforms). The subset the generator emits. */
function validate(doc: Document, schema: Schema, value: unknown, at: string): string[] {
  if (schema.$ref) return validate(doc, doc.components.schemas[schema.$ref.split('/').pop()!], value, at);
  if (value === null) return schema.nullable || schema.type === undefined ? [] : [`${at}: null`];
  if (schema.allOf) return schema.allOf.flatMap((s) => validate(doc, s, value, at));
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives) {
    return alternatives.some((s) => validate(doc, s, value, at).length === 0) ? [] : [`${at}: matches no alternative`];
  }
  if (schema.enum && !schema.enum.includes(value)) return [`${at}: ${JSON.stringify(value)} is not one of the enum`];
  const actual = Array.isArray(value) ? 'array' : typeof value;
  switch (schema.type) {
    case undefined:
      return [];
    case 'integer':
      return Number.isInteger(value) ? [] : [`${at}: expected an integer, got ${JSON.stringify(value)}`];
    case 'number':
      return actual === 'number' ? [] : [`${at}: expected a number, got ${actual}`];
    case 'string':
    case 'boolean':
      return actual === schema.type ? [] : [`${at}: expected a ${schema.type}, got ${actual}`];
    case 'array':
      if (actual !== 'array') return [`${at}: expected an array, got ${actual}`];
      return schema.items ? (value as unknown[]).flatMap((v, i) => validate(doc, schema.items!, v, `${at}[${i}]`)) : [];
    case 'object': {
      if (actual !== 'object') return [`${at}: expected an object, got ${actual}`];
      const record = value as Record<string, unknown>;
      const missing = (schema.required ?? []).filter((k) => !(k in record)).map((k) => `${at}.${k}: missing`);
      const props = Object.entries(schema.properties ?? {}).flatMap(([k, s]) =>
        k in record && record[k] !== undefined ? validate(doc, s, record[k], `${at}.${k}`) : [],
      );
      const extra =
        typeof schema.additionalProperties === 'object'
          ? Object.entries(record)
              .filter(([k]) => !(k in (schema.properties ?? {})))
              .flatMap(([k, v]) => validate(doc, schema.additionalProperties as Schema, v, `${at}.${k}`))
          : [];
      return [...missing, ...props, ...extra];
    }
    default:
      return [];
  }
}

const committed = (): Document => JSON.parse(readFileSync(COMMITTED, 'utf8'));

test.describe('Published OpenAPI document @api', () => {
  test('GET /api/openapi.json serves the committed contract (servers aside)', async ({ playwright }) => {
    const origin = new URL(ENV.apiBaseUrl).origin;
    const ctx = await playwright.request.newContext();
    const res = await ctx.get(`${origin}/api/openapi.json`);
    expect(res.status()).toBe(200);
    const served = await res.json();
    const file = committed() as unknown as Record<string, unknown>;

    expect(served.servers).toEqual([{ description: 'This deployment', url: expect.stringMatching(/^https?:\/\//) }]);
    delete served.servers;
    delete file.servers;
    expect(served).toEqual(file);
    await ctx.dispose();
  });

  test('every parameterless GET answers what the committed document says', async ({ asOwner, asSuperAdmin }) => {
    test.setTimeout(120_000);
    const doc = committed();
    const prefix = new URL(ENV.apiBaseUrl).pathname.replace(/\/+$/, '');
    const reads = Object.entries(doc.paths)
      // An SSE stream never ends, so it is not read here.
      .filter(([path]) => path.startsWith(`${prefix}/`) && !path.includes('{') && !path.startsWith(`${prefix}/sse/`))
      .flatMap(([path, item]) => (item.get ? [{ path: path.slice(prefix.length), op: item.get }] : []))
      .filter(({ op }) => !(op.parameters ?? []).some((p) => p.in === 'query' && p.required))
      .filter(({ op }) => op.responses['200']?.content?.['application/json']?.schema);

    const problems: string[] = [];
    let checked = 0;
    for (const { path, op } of reads) {
      for (const client of [asOwner, asSuperAdmin]) {
        const res = await client.get(path);
        if (res.status() !== 200) continue;
        if (!(res.headers()['content-type'] ?? '').includes('application/json')) break;
        const schema = op.responses['200'].content!['application/json'].schema!;
        problems.push(...validate(doc, schema, await res.json(), `GET ${path} (${client.role})`));
        checked++;
        break;
      }
    }
    // The owner and the super admin between them reach most reads of the starter; far fewer means the run is broken.
    expect(checked).toBeGreaterThan(40);
    expect(problems).toEqual([]);
  });
});
