import * as fs from 'fs';
import * as path from 'path';
import { listSourceFiles, stripComments } from './source-text.scan';

/**
 * Tenant-context coverage (design item 20). Static and line-based on purpose: cheap, and the failure names the file.
 *
 * 1. Every `@OnEvent` handler is `@OnTenantEvent` (it re-enters the tenant its payload names), unless that handler
 *    (`file#method`) is on the allow-list below with a reason: it never touches the database, or it is cross-tenant by
 *    design and declares `systemScope` itself. Imperative listeners (`eventEmitter.on(…)`, `.once`, `.onAny`,
 *    `.addListener`, `.prependListener`) are not allowed at all: they bypass the decorator.
 * 2. Every handler whose effective `@Roles` is exactly `SUPER_ADMIN` carries `@SystemScope` or `@TargetTenant` (on the
 *    method or its class), and no handler open to another role does. A super-admin has no tenant of its own, so a route
 *    only it can call must say whether it reads across tenants or acts on the one tenant its URL names.
 *
 * Known gaps: a listener registered through a variable not named like an emitter (`x.on(…)`) is not detected; a
 * `@Roles` built from a constant array (`@Roles(...ROLES)`) is read as no roles.
 *
 * The Desk workflow rule (every per-tenant Inngest function uses `deskStep`) lives inside the Desk folder, so a
 * product scaffolded without Desk loses it with the folder.
 */

const SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC, '..', '..', '..');
const ROOTS = [
  SRC,
  path.join(REPO_ROOT, 'packages', 'appshore', 'platform', 'src'),
  path.join(REPO_ROOT, 'packages', 'appshore', 'kernel', 'src'),
];

const HTTP_VERB = /^@(Get|Post|Put|Patch|Delete|All)\(/;
const SCOPE = /^@(SystemScope|TargetTenant)\(/;
const CLASS_LINE = /^export (default )?(abstract )?class /;
const METHOD_NAME = /^(?:public |private |protected )?(?:async )?([A-Za-z_$][\w$]*)\s*[(<]/;
const IMPERATIVE_LISTENER =
  /\b(?:eventEmitter|emitter|eventBus|events)\.(?:on|once|onAny|addListener|prependListener)\(/;

const SSE_ONLY = 'SSE fan-out only, no database access';

/** Handlers (`file#method`, repo-relative) allowed to keep plain `@OnEvent`, with the reason. */
export const ON_EVENT_ALLOW_LIST: Readonly<Record<string, string>> = {
  'apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts#handleDomainEvent': SSE_ONLY,
  'apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts#handleDomainEvent':
    'Redis cache keys only, no database access',
};

const files = ROOTS.flatMap((root) => listSourceFiles(root)).map((abs) => ({
  rel: path.relative(REPO_ROOT, abs),
  text: stripComments(fs.readFileSync(abs, 'utf8')),
}));

describe('tenant-context coverage', () => {
  describe('domain-event handlers', () => {
    const plainHandlers = files.flatMap((f) => scanDecorated(f.text, '@OnEvent(').map((m) => `${f.rel}#${m}`));

    it('finds the handlers (sanity check on the scan)', () => {
      expect(plainHandlers).toContain(
        'apps/backend/src/platform-glue/sse/domain-event-sse-bridge.service.ts#handleDomainEvent',
      );
    });

    it('every @OnEvent handler re-enters its tenant (@OnTenantEvent) or is allow-listed with a reason', () => {
      expect(plainHandlers.filter((h) => !(h in ON_EVENT_ALLOW_LIST))).toEqual([]);
    });

    it('has no stale allow-list entries', () => {
      expect(Object.keys(ON_EVENT_ALLOW_LIST).filter((h) => !plainHandlers.includes(h))).toEqual([]);
    });

    it('registers no imperative listeners that would bypass @OnTenantEvent', () => {
      const offenders = files
        .filter((f) => f.text.split('\n').some((l) => IMPERATIVE_LISTENER.test(l)))
        .map((f) => f.rel);
      expect(offenders).toEqual([]);
    });
  });

  describe('super-admin routes', () => {
    const controllers = files.filter((f) => f.rel.endsWith('.controller.ts'));
    const results = controllers.flatMap((f) => scanController(f.rel, f.text));

    it('scans a SUPER_ADMIN-only handler in every controller that declares one', () => {
      const declaring = controllers
        .filter((f) => f.text.split('\n').some((l) => /@Roles\(\s*UserRole\.SUPER_ADMIN\s*\)/.test(l.trim())))
        .map((f) => f.rel);
      const scanned = new Set(results.filter((r) => r.superAdminOnly).map((r) => r.file));
      expect(declaring.length).toBeGreaterThan(0);
      expect(declaring.filter((rel) => !scanned.has(rel))).toEqual([]);
    });

    it('every SUPER_ADMIN-only handler has @SystemScope or @TargetTenant', () => {
      expect(results.filter((r) => r.superAdminOnly && !r.scoped).map((r) => r.where)).toEqual([]);
    });

    it('no handler open to other roles has @SystemScope or @TargetTenant', () => {
      expect(results.filter((r) => !r.superAdminOnly && r.scoped).map((r) => r.where)).toEqual([]);
    });
  });

  describe('the scan bites', () => {
    it('flags a SUPER_ADMIN-only handler with no scope, and a scoped handler open to tenants', () => {
      const text = [
        '@Controller("x")',
        '@Roles(UserRole.SUPER_ADMIN)',
        'export class XController {',
        '  @Get()',
        '  list() {}',
        '  @Get(":id")',
        '  @SystemScope("super-admin")',
        '  @Roles(',
        '    UserRole.OWNER,',
        '    UserRole.SUPER_ADMIN,',
        '  )',
        '  one() {}',
        '}',
      ].join('\n');
      const scan = scanController('x.controller.ts', text);
      expect(scan.map((r) => [r.superAdminOnly, r.scoped])).toEqual([
        [true, false],
        [false, true],
      ]);
    });

    it('a class-level scope covers every handler; an undecorated class does not inherit the previous one', () => {
      const text = [
        '@Roles(UserRole.SUPER_ADMIN)',
        '@SystemScope("super-admin")',
        'export class A {',
        '  @Get()',
        '  list() {}',
        '}',
        'export class B {',
        '  @Roles(UserRole.SUPER_ADMIN)',
        '  @Get()',
        '  list() {}',
        '}',
      ].join('\n');
      expect(scanController('a.controller.ts', text).map((r) => r.scoped)).toEqual([true, false]);
    });

    it('finds a plain @OnEvent method', () => {
      expect(scanDecorated("@OnEvent('a.b', { async: true })\n  async onIt(e) {}", '@OnEvent(')).toEqual(['onIt']);
      expect(scanDecorated("@OnTenantEvent('a.b')\n  async onIt(e) {}", '@OnEvent(')).toEqual([]);
    });
  });
});

/** Names of methods carrying a decorator line that starts with `decorator`. */
function scanDecorated(text: string, decorator: string): string[] {
  const names: string[] = [];
  let armed = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith(decorator)) {
      armed = true;
      continue;
    }
    if (!armed || line.startsWith('@') || line === '') continue;
    const m = METHOD_NAME.exec(line);
    if (m) {
      names.push(m[1]);
      armed = false;
    }
  }
  return names;
}

interface HandlerScan {
  file: string;
  where: string;
  superAdminOnly: boolean;
  scoped: boolean;
}

/** Group consecutive decorator lines (balancing parens) into blocks, each followed by its target line. */
function scanController(rel: string, text: string): HandlerScan[] {
  const out: HandlerScan[] = [];
  let classDecorators: string[] = [];
  let pending: string[] = [];
  let depth = 0;
  let current = '';

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (depth > 0) {
      current += ' ' + line;
      depth += parenDelta(line);
      if (depth <= 0) {
        pending.push(current);
        depth = 0;
      }
      continue;
    }
    if (line.startsWith('@')) {
      current = line;
      depth = parenDelta(line);
      if (depth <= 0) {
        pending.push(current);
        depth = 0;
      }
      continue;
    }
    // Every class starts fresh: an undecorated class must not inherit the previous class's decorators.
    if (CLASS_LINE.test(line)) {
      classDecorators = pending;
      pending = [];
      continue;
    }
    if (pending.length === 0) continue;
    if (pending.some((d) => HTTP_VERB.test(d))) {
      const roles = rolesOf(pending) ?? rolesOf(classDecorators);
      out.push({
        file: rel,
        where: `${rel}: ${line.slice(0, 60)}`,
        superAdminOnly: roles !== undefined && roles.length === 1 && roles[0] === 'SUPER_ADMIN',
        scoped: pending.some((d) => SCOPE.test(d)) || classDecorators.some((d) => SCOPE.test(d)),
      });
    }
    pending = [];
  }
  return out;
}

function parenDelta(line: string): number {
  return (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0);
}

function rolesOf(decorators: string[]): string[] | undefined {
  const d = decorators.find((x) => x.startsWith('@Roles('));
  if (!d) return undefined;
  return [...d.matchAll(/UserRole\.([A-Z_]+)|'([A-Z_]+)'/g)].map((m) => m[1] ?? m[2]);
}
