import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { scanListContract } from './list-contract.scan';
import { declaredClasses, inputParams, isDtoClass, typeOnlyImports } from './request-dto.scan';

/**
 * ADR "API contract": one contract for people and agents, enforced as a ratchet.
 *
 * Each rule scans controller and service sources. A violation that existed when its rule was adopted is frozen in
 * `api-contract.baseline.json`. The spec fails on any violation NOT in the baseline (new code must follow the rule)
 * and on any baseline entry that no longer violates (the fix must also shrink the baseline, so it never grows back).
 *
 * Shrinking after a fix: `UPDATE_API_BASELINE=1 pnpm --filter @app/backend exec jest src/architecture/api-contract`
 * rewrites the baseline as (baseline ∩ current). It can only remove entries, never add them.
 *
 * Exceptions that are decisions, not debt, live in `api-contract.allowlist.json`, one entry per key, each key
 * starting with the file path and each with its reason. A stale entry fails. Four sections:
 * - `PROVIDER_ROUTES`: a route whose wire format a third party sets (a vendor webhook, MCP, OAuth, an SSE stream).
 *   The value names the standard or vendor document. An entry exempts the route from `status/no-ack-bodies`,
 *   `input/query-is-a-dto`, `naming/snake-case-query-keys` and `errors/controller-400-names-its-field`, and from
 *   nothing else.
 * - `BOUNDED_LISTS`: a list the domain bounds, which may stay a bare array.
 * - `BOUNDED_READS`: a `findMany` without `take` whose size the domain fixes.
 * - `QUERY_KEY_ALLOWLIST`: a query key a third party names on a route that is otherwise ours.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const ROOTS = [join(REPO, 'apps', 'backend', 'src'), join(REPO, 'packages', 'appshore', 'platform', 'src')];
const BASELINE_PATH = join(__dirname, 'api-contract.baseline.json');
const ALLOWLIST_PATH = join(__dirname, 'api-contract.allowlist.json');

type Baseline = Record<string, string[]>;

const ALLOWLIST_SECTIONS = ['PROVIDER_ROUTES', 'BOUNDED_LISTS', 'BOUNDED_READS', 'QUERY_KEY_ALLOWLIST'] as const;
type AllowlistSection = (typeof ALLOWLIST_SECTIONS)[number];
type Allowlist = Record<AllowlistSection, Record<string, string>>;

const ALLOWLIST: Allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
const { PROVIDER_ROUTES, BOUNDED_LISTS, BOUNDED_READS, QUERY_KEY_ALLOWLIST } = ALLOWLIST;

interface Route {
  key: string; // "<file> :: <METHOD> <path>" — stable across line moves
  method: string;
  path: string;
  decorators: string;
  /** Decorators on the controller class — they apply to every route in it (@UseGuards, @SkipThrottle, …). */
  classDecorators: string;
  signature: string;
  file: SourceFile;
  /** The handler's body (brace-counted from its signature). */
  body: string;
  /** Line span of the route in its file, decorators to closing brace (0-based, inclusive). */
  startLine: number;
  endLine: number;
}

interface SourceFile {
  rel: string;
  src: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.includes('/test/')) out.push(p);
  }
  return out;
}

const FILES: SourceFile[] = ROOTS.flatMap((r) => walk(r)).map((f) => ({
  rel: relative(REPO, f),
  src: readFileSync(f, 'utf8'),
}));

const CONTROLLERS = FILES.filter((f) => /@Controller\(/.test(f.src));

/** Route decorators + the handler signature, read straight from source (no Nest boot needed). */
function routesOf(file: SourceFile): Route[] {
  // `@Controller('/')` is the root: no segment.
  const base = ((file.src.match(/@Controller\(\s*(?:\{[^}]*path:\s*)?['"`]([^'"`]*)['"`]/) ?? [])[1] ?? '').replace(
    /^\/+|\/+$/g,
    '',
  );
  const lines = file.src.split('\n');
  const routes: Route[] = [];
  lines.forEach((line, i) => {
    const verb = line.match(/^\s*@(Get|Post|Put|Patch|Delete|All|Sse)\(([^)]*)\)/);
    if (!verb) return;
    // `@Sse('x')` is a GET that streams.
    const method = verb[1] === 'Sse' ? 'GET' : verb[1].toUpperCase();
    const sub = (verb[2].match(/['"`]([^'"`]*)['"`]/) ?? [])[1] ?? '';
    const path = '/' + [base, sub].filter(Boolean).join('/');
    const before: string[] = [];
    for (let k = i - 1; k >= 0 && /^\s*(@|\/\/|\*|[\w'"`.,:{}[\]\s()]+\)?,?\s*$)/.test(lines[k]) && i - k < 25; k--) {
      if (/^\s*$/.test(lines[k]) || /^\s*(async\s+)?\w+\s*\(/.test(lines[k])) break;
      before.unshift(lines[k]);
    }
    const after: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !/^\s*(async\s+)?\w+\s*\(/.test(lines[j]) && j - i < 40; j++) after.push(lines[j]);
    let signature = '';
    let signatureEnd = j;
    for (let s = j; s < Math.min(j + 20, lines.length); s++) {
      signature += lines[s] + '\n';
      signatureEnd = s;
      if (/\)\s*(:[^{]*)?\{\s*$/.test(lines[s])) break;
    }
    // Count braces from the line that opens the body — an inline type in a multi-line signature
    // (`user: { tenantId: string },`) would otherwise balance to zero before the body starts.
    let body = lines.slice(j, signatureEnd).join('\n') + '\n';
    let depth = 0;
    let opened = false;
    let endLine = signatureEnd;
    for (let s = signatureEnd; s < lines.length; s++) {
      endLine = s;
      body += lines[s] + '\n';
      for (const ch of lines[s]) {
        if (ch === '{') {
          depth++;
          opened = true;
        } else if (ch === '}') depth--;
      }
      if (opened && depth <= 0) break;
    }
    routes.push({
      key: `${file.rel} :: ${method} ${path}`,
      method,
      path,
      decorators: [...before, line, ...after].join('\n'),
      classDecorators: classDecoratorsBefore(lines, i),
      signature,
      file,
      body,
      startLine: i - before.length,
      endLine,
    });
  });
  return routes;
}

/** The decorator block above the nearest `class` declaration before line `routeLine`. */
function classDecoratorsBefore(lines: string[], routeLine: number): string {
  let cls = routeLine;
  while (cls >= 0 && !/^\s*(export\s+)?(abstract\s+)?class\s/.test(lines[cls])) cls--;
  const block: string[] = [];
  for (let k = cls - 1; k >= 0; k--) {
    const t = lines[k].trim();
    if (t.startsWith('//')) continue; // a comment between decorators
    if (t === '' || t.startsWith('import ') || t.startsWith('*/') || t.startsWith('*')) break;
    block.unshift(lines[k]);
  }
  return block.join('\n');
}

const ROUTES = CONTROLLERS.flatMap(routesOf);

/** Method + class decorators: what actually applies to the route. */
const applied = (r: Route) => `${r.classDecorators}\n${r.decorators}`;

/** Text-scan violation key: "<file> :: <trimmed matched snippet>" (deduplicated per file). */
function scan(
  files: SourceFile[],
  pattern: RegExp,
  exempt: (file: SourceFile, line: number) => boolean = () => false,
): string[] {
  const out = new Set<string>();
  for (const f of files) {
    for (const m of f.src.matchAll(pattern)) {
      if (exempt(f, f.src.slice(0, m.index).split('\n').length - 1)) continue;
      // The whole source line, so a second violation in an already-baselined file is still new.
      const lineEnd = f.src.indexOf('\n', m.index);
      const line = f.src.slice(m.index, lineEnd === -1 ? undefined : lineEnd);
      out.add(`${f.rel} :: ${line.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    }
  }
  return [...out];
}

/** The bodies (from the opening line) of every function whose header matches `header` — brace-counted. */
function functionBodies(src: string, header: RegExp): string[] {
  const bodies: string[] = [];
  for (const m of src.matchAll(header)) {
    const start = m.index ?? 0;
    let depth = 0;
    for (let i = start + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) {
        bodies.push(src.slice(start, i + 1));
        break;
      }
    }
  }
  return bodies;
}

/**
 * A handler that writes the response itself (stream, redirect, protocol): `@Res()` without `passthrough`, or an
 * `@Sse` stream. `passthrough` still declares its status.
 */
const isRawResponse = (r: Route) =>
  /@Res\((?!\s*\{\s*passthrough:\s*true)/.test(r.signature) || /^\s*@Sse\(/m.test(r.decorators);

/** A route whose wire format a third party sets: see the header for what an entry exempts. */
const isProviderRoute = (r: Route) => r.key in PROVIDER_ROUTES;

/** True when `line` of `file` sits inside a provider route's handler. */
const inProviderRoute = (file: SourceFile, line: number) =>
  ROUTES.some((r) => r.file === file && isProviderRoute(r) && line >= r.startLine && line <= r.endLine);

/**
 * Last path segments that name an action on the record before them (`POST /invitations/:invitation_id/resend`).
 * Such a POST changes an existing record: it is 200 (or 202 when queued), never 201. The list is explicit: a plural
 * noun after a param is a sub-collection create (`/tickets/:ticket_number/messages`) and stays 201. A product adds
 * its own verbs here.
 */
const ACTION_VERBS = new Set([
  'accept',
  'activate',
  'approve',
  'archive',
  'block',
  'cancel',
  'cancel-immediately',
  'categorize',
  'change-plan',
  'claim',
  'close',
  'complete',
  'credit',
  'deactivate',
  'decide',
  'deny',
  'discard',
  'disconnect',
  'dismiss',
  'extend-trial',
  'fail',
  'move',
  'pause',
  'pause-jobs',
  'publish',
  'reactivate',
  'read',
  'refund',
  'reject',
  'reopen',
  'replay',
  'resend',
  'reset',
  'resume',
  'resume-jobs',
  'retry',
  'revoke',
  'rollback',
  'rotate',
  'rotate-secret',
  'run',
  'snooze',
  'start',
  'step-up',
  'submit',
  'suspend',
  'sync',
  'test',
  'trigger',
  'unblock',
  'unread',
  'unsnooze',
  'validate',
  'withdraw',
]);
const isActionPost = (r: Route) => {
  const segs = r.path.split('/').filter(Boolean);
  return segs.length >= 2 && segs[segs.length - 2].startsWith(':') && ACTION_VERBS.has(segs[segs.length - 1]);
};

/** The collection a param addresses: `/tenants/:tenant_id/users` → ['tenants', ':tenant_id']. */
const collectionParams = (path: string): [string, string][] => {
  const segs = path.split('/').filter(Boolean);
  return segs.flatMap((s, i) => (s.startsWith(':') && i > 0 && !segs[i - 1].startsWith(':') ? [[segs[i - 1], s]] : []));
};

/** Query keys a route reads: `@Query('key')` strings and the properties of a `@Query()` DTO class. */
const DTO_PROPS = new Map<string, string[]>();
for (const f of FILES) {
  for (const m of f.src.matchAll(/export class (\w+)[^{]*\{/g)) {
    const props = functionBodies(f.src.slice(m.index), /export class \w+[^{]*\{/g)[0] ?? '';
    // A query DTO's key is the property's WIRE name — the `name:` its decorator declares (`@QueryString({ name:
    // 'sync_type' }) syncType`), else the property itself.
    const keys: string[] = [];
    let decorators = '';
    for (const line of props.split('\n').slice(1)) {
      const prop = line.match(/^\s{2}(?:readonly\s+)?(\w+)[?!]?\s*:/);
      if (!prop) {
        decorators += line + '\n';
        continue;
      }
      const wire =
        decorators.match(/\bname:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? decorators.match(/@\w+\(\s*['"`]([^'"`]+)['"`]/)?.[1]; // `{ name: 'sync_type' }` // a positional wire name (`@providerParam('error_uri')`)
      keys.push(wire ?? prop[1]);
      decorators = '';
    }
    DTO_PROPS.set(m[1], keys);
  }
}
const queryKeys = (r: Route): string[] => [
  ...[...r.signature.matchAll(/@Query\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]),
  ...[...r.signature.matchAll(/@Query\(\)\s*\w+\s*:\s*(\w+)/g)].flatMap((m) => DTO_PROPS.get(m[1]) ?? []),
];

/**
 * Collections whose param name is decided. The rule checks against these, not a vote. A collection that is not
 * here takes its most-used name. A product pins its own entities here.
 */
const CANONICAL_PARAMS: Record<string, string> = {
  tenants: ':tenant_id',
  'api-keys': ':api_key_id',
};

/**
 * Deliberately outside the published contract: QA levers, signed vendor webhooks, OAuth redirect callbacks. Marked
 * with `@ApiExcludeController()` or `@ApiExcludeEndpoint()`.
 */
const isExcludedFromContract = (r: Route) =>
  /@ApiExcludeController\(/.test(r.classDecorators) || /@ApiExcludeEndpoint\(/.test(r.decorators);

/** A documented success body: the platform's `@ApiResult`, a 204, or a swagger response with a type or schema. */
const RESPONSE_DOCUMENTED =
  /@ApiResult\(|@ApiNoContentResponse\(|@Api(?:Ok|Created|Accepted)?Response\(\s*\{[^@]*\b(?:type|schema)\s*:/;

/** An acknowledgement instead of the resource: `{ success: true }`, `{ deleted: true }`, `{ message: '…' }`. */
const ACK_BODY = /return\s*\{\s*(success|deleted|disconnected|queued|unlinked|signed|message)\s*:/;

/**
 * Every class a handler may take as input: declared beside the controllers, in the platform, or in the kernel
 * (the shared query-DTO bases — `CursorQueryDto`, `ListQueryDto`, …).
 */
const KERNEL_SOURCES = walk(join(REPO, 'packages', 'appshore', 'kernel', 'src')).map((f) => readFileSync(f, 'utf8'));
const CLASSES = declaredClasses([...FILES.map((f) => f.src), ...KERNEL_SOURCES]);

/** The `@Body` / `@Query` params of a route the pipe cannot validate (see `request-dto.scan.ts`). */
function unvalidatedInputs(r: Route, decorator: 'Body' | 'Query') {
  const typeOnly = typeOnlyImports(r.file.src);
  return inputParams(r.signature).filter(
    (p) => p.decorator === decorator && (p.pick !== null || !isDtoClass(p.type, CLASSES, typeOnly)),
  );
}

const routeOf = (violation: string) => violation.replace(/ \([^)]*\)$/, '');
const LIST_SCAN = () => scanListContract(CONTROLLERS.map((f) => join(REPO, f.rel)));

/**
 * The rules. Each returns the full set of current violations; the ratchet compares it to the baseline. The section
 * numbers are those of the ADR "API contract" (`docs/adr/`).
 */
const RULES: Record<string, { why: string; violations: () => string[] }> = {
  'status/post-explicit-http-code': {
    why: 'Section 1: every POST declares its status with @HttpCode: 201 create, 200 action, 202 queued, 204 no body',
    violations: () =>
      ROUTES.filter((r) => r.method === 'POST' && !isRawResponse(r) && !/@HttpCode\(/.test(r.decorators)).map(
        (r) => r.key,
      ),
  },
  'status/delete-204': {
    why: 'Section 1: DELETE answers 204 No Content: @HttpCode(HttpStatus.NO_CONTENT) and a handler that returns nothing',
    violations: () =>
      ROUTES.filter(
        (r) =>
          r.method === 'DELETE' &&
          !isRawResponse(r) &&
          (!/@HttpCode\((204|HttpStatus\.NO_CONTENT)\)/.test(r.decorators) || /\breturn\s+[^;\s]/.test(r.body)),
      ).map((r) => r.key),
  },
  'status/action-is-not-created': {
    why: 'Section 1: an action POST (/:id/<verb>) changes an existing record: 200 (or 202 queued), never 201',
    violations: () =>
      ROUTES.filter(
        (r) => r.method === 'POST' && isActionPost(r) && /@HttpCode\((201|HttpStatus\.CREATED)\)/.test(r.decorators),
      ).map((r) => r.key),
  },
  'status/no-ack-bodies': {
    why: 'Section 1: a success returns the resource as it is now (or 204), never { success | deleted | disconnected | queued | message }',
    violations: () => ROUTES.filter((r) => !isProviderRoute(r) && ACK_BODY.test(r.body)).map((r) => r.key),
  },
  'input/body-is-a-dto-class': {
    why: "Section 3: @Body is a class-validator DTO class (imported as a value), never any/Record/inline/interface/array/`import type`, never @Body('field')",
    violations: () => ROUTES.filter((r) => unvalidatedInputs(r, 'Body').length > 0).map((r) => r.key),
  },
  'input/query-is-a-dto': {
    why: "Section 3: a query string is a class, @Query() query: XQueryDto built from the query-dto kit, never @Query('x')",
    violations: () =>
      ROUTES.filter((r) => !isProviderRoute(r)).flatMap((r) =>
        unvalidatedInputs(r, 'Query').map((p) => `${r.key} :: ${p.pick ?? `@Query() ${p.type}`}`),
      ),
  },
  'input/no-number-parse-in-controllers': {
    why: 'Section 3: no parseInt/parseFloat/Number() in a controller: a query DTO (@QueryInt/@QueryLimit) or ParseIntPipe parses',
    violations: () => scan(CONTROLLERS, /\b(?:parseInt|parseFloat|Number)\(/g),
  },
  'input/no-schema-parse-in-controllers': {
    why: 'Section 2: a Zod .parse() in a controller is not the boundary: use a DTO, or parseWithSchema() for fieldErrors',
    violations: () => scan(CONTROLLERS, /\b\w+Schema\.parse\(/g),
  },
  'errors/no-hand-built-error-body': {
    why: 'Section 2: errors go through the one envelope writer: no res.status(...).json(...) error bodies',
    violations: () =>
      scan(
        // The envelope writer itself, and the RFC 6749 OAuth filter (a shape the standard sets).
        FILES.filter((f) => !/(error-envelope|oauth-error\.filter)\.ts$/.test(f.rel)),
        /\bres(?:ponse)?\s*\.status\(\s*(?:4\d\d|5\d\d|HttpStatus\.\w+|\w*[sS]tatus\w*)\s*\)\s*\.json\(/g,
      ),
  },
  'errors/no-plain-error-in-controllers': {
    why: 'Section 2: controllers throw NestJS exceptions, never new Error()',
    violations: () => scan(CONTROLLERS, /throw new Error\(/g),
  },
  'errors/transition-is-409': {
    why: 'Section 2: an illegal state transition is 409 INVALID_STATE (invalidState()), not 400 or 403',
    violations: () => [
      ...scan(
        FILES.filter((f) => /transition/i.test(f.rel)),
        /new BadRequestException\(/g,
      ),
      // Any `assert…Transition` guard, wherever it lives (rule lifecycle, repos, credentials, …).
      ...FILES.flatMap((f) =>
        functionBodies(f.src, /\bassert\w*Transition\w*\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/g)
          .filter((body) => /new (BadRequest|Forbidden)Exception\(/.test(body))
          .map((body) => `${f.rel} :: ${body.split('\n')[0].trim().slice(0, 120)}`),
      ),
    ],
  },
  'errors/controller-400-names-its-field': {
    why: 'Section 2: a 400 from a controller names the field at fault: fieldError(field, detail), not a bare BadRequestException',
    violations: () => scan(CONTROLLERS, /new BadRequestException\(\s*['"`]/g, inProviderRoute),
  },
  'errors/no-internals-in-messages': {
    why: 'Section 2: error copy carries no internal ids, storage keys, raw vendor or exception text, or raw enum states',
    violations: () =>
      scan(
        FILES,
        /(?:Exception|invalidState|stale|duplicate|fieldError)\(\s*`[^`]*\$\{[^}]*?(?:[a-z]Id|Ids|s3Key|\.message|\berr(?:or)?\b|\bfrom\b|\bto\b)\s*\}/g,
      ),
  },
  'errors/cross-tenant-is-404': {
    why: "Section 2: another tenant's record is 404. A 403 confirms it exists",
    violations: () =>
      scan(
        FILES,
        /new ForbiddenException\(\s*['"`]([^'"`]*(different|another|other) (tenant|workspace)[^'"`]*|Access denied|You do not have access to this resource)['"`]/gi,
      ),
  },
  'output/no-raw-prisma-from-controllers': {
    why: 'Section 3: controllers return serialized DTOs, never a Prisma row',
    violations: () => scan(CONTROLLERS, /return (?:await )?this\.prisma\.\w+\.\w+\(/g),
  },
  'output/lists-are-cursor-lists': {
    why: 'Section 3: a list is a CursorList { items, nextCursor, total } with a clamped limit and a cursor, never an array (unless in BOUNDED_LISTS), another envelope, or offset/page paging',
    violations: () => LIST_SCAN().lists.filter((v) => !(routeOf(v) in BOUNDED_LISTS)),
  },
  'output/list-reads-are-bounded': {
    why: 'Section 3: no list stays unbounded: the service a GET calls never runs findMany without take (id-set lookups and BOUNDED_READS excepted)',
    violations: () => LIST_SCAN().unboundedReads.filter((v) => !(v in BOUNDED_READS)),
  },
  'naming/snake-case-url-params': {
    why: 'Section 1: URL params are :snake_case',
    violations: () => ROUTES.filter((r) => /:[a-z0-9]*[A-Z]/.test(r.path)).map((r) => r.key),
  },
  'naming/one-param-name-per-collection': {
    why: "Section 1: one name per entity: every route names a collection's param the same way (/tenants/:tenant_id)",
    violations: () => {
      const names = new Map<string, Map<string, number>>();
      for (const r of ROUTES)
        for (const [coll, param] of collectionParams(r.path)) {
          const m = names.get(coll) ?? new Map<string, number>();
          m.set(param, (m.get(param) ?? 0) + 1);
          names.set(coll, m);
        }
      // A pinned name wins; otherwise the most-used name (ties broken alphabetically, so one new route can't
      // flip the canonical name and turn compliant routes into violations).
      const canonical = new Map(
        [...names].map(([c, m]) => [
          c,
          CANONICAL_PARAMS[c] ?? [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
        ]),
      );
      return ROUTES.filter((r) => collectionParams(r.path).some(([c, p]) => canonical.get(c) !== p)).map((r) => r.key);
    },
  },
  'naming/param-matches-route': {
    why: "Section 1: every @Param('x') names a :x in its route. A renamed placeholder otherwise reads undefined, silently",
    violations: () =>
      ROUTES.flatMap((r) =>
        [...r.signature.matchAll(/@Param\(\s*['"`]([^'"`]+)['"`]/g)]
          .filter((m) => !new RegExp(`:${m[1]}(/|$)`).test(r.path))
          .map((m) => `${r.key} (:${m[1]})`),
      ),
  },
  'naming/snake-case-query-keys': {
    why: "Section 1: query keys are snake_case (`@Query('sync_type')`, a query DTO's props) and a free-text search is `q`",
    violations: () =>
      ROUTES.filter((r) => !isProviderRoute(r)).flatMap((r) =>
        queryKeys(r)
          .filter((k) => (/[A-Z]/.test(k) || k === 'search') && !(`${r.key} (?${k})` in QUERY_KEY_ALLOWLIST))
          .map((k) => `${r.key} (?${k})`),
      ),
  },
  'docs/api-operation': {
    why: 'Section 4: every route in the published contract has @ApiOperation',
    violations: () =>
      ROUTES.filter((r) => !isExcludedFromContract(r) && !/@ApiOperation\(/.test(r.decorators)).map((r) => r.key),
  },
  'docs/response-documented': {
    why: 'Section 4: a non-public route that returns its body documents it: @ApiResult(<response schema>, <status>) or @ApiNoContentResponse()',
    violations: () =>
      ROUTES.filter(
        (r) =>
          !isRawResponse(r) &&
          !/@Public\(\)/.test(applied(r)) &&
          !isExcludedFromContract(r) &&
          !RESPONSE_DOCUMENTED.test(r.decorators),
      ).map((r) => r.key),
  },
  'edge/skip-throttle-only-health-sse': {
    why: 'Edge: @SkipThrottle only on health and SSE routes. Everything else gets a ceiling (GENEROUS_THROTTLE)',
    violations: () =>
      ROUTES.filter((r) => /@SkipThrottle\(/.test(applied(r)) && !/\/(health|sse)\b/.test(r.path)).map((r) => r.key),
  },
  'edge/agent-routes-rate-limited': {
    why: 'Edge: a route authenticated by API key or OAuth token also carries AgentRateLimitGuard',
    violations: () =>
      ROUTES.filter(
        (r) => /(ApiKeyAuthGuard|OAuthTokenGuard)/.test(applied(r)) && !/AgentRateLimitGuard/.test(applied(r)),
      ).map((r) => r.key),
  },
  'edge/agent-401-challenge': {
    why: 'Edge (RFC 6750, RFC 9728): a key- or OAuth-authenticated route answers 401 with WWW-Authenticate (BearerChallengeFilter)',
    violations: () =>
      ROUTES.filter(
        (r) => /(ApiKeyAuthGuard|OAuthTokenGuard)/.test(applied(r)) && !/BearerChallengeFilter/.test(applied(r)),
      ).map((r) => r.key),
  },
};

const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const current: Baseline = Object.fromEntries(
  Object.entries(RULES).map(([rule, def]) => [rule, [...new Set(def.violations())].sort()]),
);

if (process.env.UPDATE_API_BASELINE === '1') {
  const shrunk = Object.fromEntries(
    Object.keys(RULES).map((rule) => [rule, (baseline[rule] ?? []).filter((k) => current[rule].includes(k))]),
  );
  writeFileSync(BASELINE_PATH, JSON.stringify(shrunk, null, 2) + '\n');
}

describe('API contract (ratchet)', () => {
  const route = (suffix: string) => ROUTES.find((r) => r.key.endsWith(suffix));

  it('the scanner sees the API surface (sanity)', () => {
    expect(ROUTES.length).toBeGreaterThan(150);
    // `@All()` and `@Sse()` are routes too, and `@Controller('/')` is the root.
    expect(route('sse.controller.ts :: GET /sse/stream')).toBeDefined();
    expect(route('mcp-root.controller.ts :: POST /')).toBeDefined();
  });

  it('the list scanner reads handler types (sanity: an array list is seen, a single record is not)', () => {
    const lists = LIST_SCAN().lists.map(routeOf);
    expect(lists).toContain('packages/appshore/platform/src/domains/api-keys/api-keys.controller.ts :: GET /api-keys');
    expect(lists.some((k) => k.endsWith('GET /auth/me'))).toBe(false);
  });

  it('the scanner sees class-level decorators (a class @Throttle / @UseFilters applies to every route)', () => {
    const missing = ROUTES.filter((r) => !/@Controller\(/.test(r.classDecorators)).map((r) => r.key);
    expect(missing).toEqual([]);
    const mcp = route('mcp-server.controller.ts :: POST /mcp');
    expect(mcp?.classDecorators).toMatch(/@UseFilters\(BearerChallengeFilter\)/);
    expect(mcp && applied(mcp)).toMatch(/@Throttle\(GENEROUS_THROTTLE\)/);
  });

  it('the checks read route shape (sanity: verbs, ack bodies, raw responses, collection params, query keys)', () => {
    const shaped = (method: string, path: string, body = '') => ({ ...ROUTES[0], method, path, body });
    expect(isActionPost(shaped('POST', '/invitations/:invitation_id/resend'))).toBe(true);
    expect(isActionPost(shaped('POST', '/support/tickets/:id/messages'))).toBe(false);
    expect(isActionPost(shaped('POST', '/billing/cancel'))).toBe(false); // no param before it: reviewed, not inferred
    expect(ACK_BODY.test('return { success: true };')).toBe(true);
    expect(ACK_BODY.test('return { message: `done` };')).toBe(true);
    expect(ACK_BODY.test('return { updated: result.count };')).toBe(false);
    expect(collectionParams('/tenants/:tenant_id/users/:user_id')).toEqual([
      ['tenants', ':tenant_id'],
      ['users', ':user_id'],
    ]);
    // An SSE stream and an `@Res()` handler write their own response; `passthrough` does not.
    const stream = route('sse.controller.ts :: GET /sse/stream');
    const logout = route('auth.controller.ts :: POST /auth/logout');
    expect(stream && isRawResponse(stream)).toBe(true);
    expect(logout && isRawResponse(logout)).toBe(false);
    // `@Query('x')` keys are read from the signature.
    const authorize = route('oauth-provider.controller.ts :: GET /oauth/authorize');
    expect(authorize && queryKeys(authorize)).toEqual(expect.arrayContaining(['client_id', 'redirect_uri']));
    // A multi-line signature with an inline type still yields the whole handler body.
    const pause = route('api-keys.controller.ts :: POST /api-keys/:api_key_id/pause');
    expect(pause?.body).toMatch(/apiKeysService\.pause\(/);
  });

  describe('api-contract.allowlist.json', () => {
    it('has exactly the four sections', () => {
      expect(Object.keys(ALLOWLIST).sort()).toEqual([...ALLOWLIST_SECTIONS].sort());
    });

    it('every entry starts with the path of a file that exists, and gives its reason', () => {
      const files = new Set(FILES.map((f) => f.rel));
      const bad = ALLOWLIST_SECTIONS.flatMap((section) =>
        Object.entries(ALLOWLIST[section])
          .filter(([key, reason]) => !files.has(key.split(' :: ')[0]) || typeof reason !== 'string' || !reason.trim())
          .map(([key]) => `${section}: ${key}`),
      );
      expect(bad).toEqual([]);
    });

    it('every PROVIDER_ROUTES entry names a live route (no stale entry)', () => {
      const live = new Set(ROUTES.map((r) => r.key));
      expect(Object.keys(PROVIDER_ROUTES).filter((k) => !live.has(k))).toEqual([]);
    });

    it('every provider route is documented in OpenAPI or excluded from it on purpose', () => {
      const undecided = ROUTES.filter(
        (r) => isProviderRoute(r) && !isExcludedFromContract(r) && !/@ApiOperation\(/.test(r.decorators),
      ).map((r) => r.key);
      expect(undecided).toEqual([]);
    });

    it('a provider entry exempts its route from four rules and from nothing else', () => {
      const exempting = [
        'status/no-ack-bodies',
        'input/query-is-a-dto',
        'naming/snake-case-query-keys',
        'errors/controller-400-names-its-field',
      ];
      const stripe = 'apps/backend/src/domains/billing/controllers/webhook.controller.ts :: POST /webhooks/billing';
      const callback =
        'apps/backend/src/domains/integrations/oauth/oauth.controller.ts :: GET /integrations/oauth/callback';
      const saved = { [stripe]: PROVIDER_ROUTES[stripe], [callback]: PROVIDER_ROUTES[callback] };
      const violationsOf = (rules: string[]) => rules.flatMap((rule) => RULES[rule].violations());
      const others = Object.keys(RULES).filter((rule) => !exempting.includes(rule));
      const exemptBefore = violationsOf(exempting);
      const othersBefore = violationsOf(others);
      delete PROVIDER_ROUTES[stripe];
      delete PROVIDER_ROUTES[callback];
      try {
        // Without their entries the two routes violate: Stripe's bare 400s, the vendor's own query keys.
        const exposed = violationsOf(exempting).filter((v) => !exemptBefore.includes(v));
        expect(exposed.some((v) => v.includes('webhook.controller.ts') && v.includes('BadRequestException'))).toBe(
          true,
        );
        expect(exposed.some((v) => v.startsWith(callback))).toBe(true);
        // Every other rule reads the same with or without the entries.
        expect(violationsOf(others)).toEqual(othersBefore);
      } finally {
        Object.assign(PROVIDER_ROUTES, saved);
      }
    });

    it('every BOUNDED_LISTS entry still names a list route (no stale entry)', () => {
      const lists = new Set(LIST_SCAN().lists.map(routeOf));
      expect(Object.keys(BOUNDED_LISTS).filter((k) => !lists.has(k))).toEqual([]);
    });

    it('every BOUNDED_READS entry still names an unbounded read (no stale entry)', () => {
      const reads = new Set(LIST_SCAN().unboundedReads);
      expect(Object.keys(BOUNDED_READS).filter((k) => !reads.has(k))).toEqual([]);
    });

    it('every QUERY_KEY_ALLOWLIST entry still names a live query key (no stale entry)', () => {
      const live = new Set(ROUTES.flatMap((r) => queryKeys(r).map((k) => `${r.key} (?${k})`)));
      expect(Object.keys(QUERY_KEY_ALLOWLIST).filter((k) => !live.has(k))).toEqual([]);
    });
  });

  describe.each(Object.keys(RULES))('%s', (rule) => {
    const allowed = new Set(baseline[rule] ?? []);

    it('adds no new violation', () => {
      const added = current[rule].filter((k) => !allowed.has(k));
      if (added.length) {
        throw new Error(
          `${RULES[rule].why}\nNew violation(s): fix them, do not baseline them:\n  ${added.join('\n  ')}`,
        );
      }
    });

    it('baseline holds only live violations (fixed entries are removed)', () => {
      const stale = [...allowed].filter((k) => !current[rule].includes(k));
      if (stale.length) {
        throw new Error(
          `Fixed. Remove from api-contract.baseline.json (or run with UPDATE_API_BASELINE=1):\n  ${stale.join('\n  ')}`,
        );
      }
    });
  });
});
