import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * No array-form or indirect `$transaction` (design item 20).
 *
 * Two tenants' array transactions started in the same tick run the second under the first tenant's settings once
 * the per-transaction tenant setting arrives, and a one-element array is not a transaction at all on Prisma 7.3.
 * So the array form is a cross-tenant hazard, not a style choice: every transaction is interactive,
 * `$transaction(async (tx) => …)`, and the callback is written inline so this parse can see it.
 *
 * Parse-only (the TypeScript AST, no type-check), so it runs in seconds under `pnpm test` and the pre-push hook.
 * It reads specs too: a spec that builds an array transaction would keep the mock's array branch alive.
 *
 * Allowed: `$transaction(async (tx) => …)` and `$transaction(function (tx) { … })`, with or without options.
 * `OutboxService.transaction((tx, emit) => …)` is not `$transaction` and is not flagged; it takes a callback and
 * opens an interactive transaction itself.
 *
 * Known gap: a call through an alias (`const run = prisma.$transaction.bind(prisma)`) is not seen.
 */

const SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC, '..', '..', '..');
const ROOTS = [
  SRC,
  path.join(REPO_ROOT, 'packages', 'appshore', 'kernel', 'src'),
  path.join(REPO_ROOT, 'packages', 'appshore', 'platform', 'src'),
  path.join(REPO_ROOT, 'packages', 'appshore', 'db', 'src'),
  path.join(REPO_ROOT, 'packages', 'appshore', 'db', 'prisma'),
  path.join(REPO_ROOT, 'packages', 'appshore', 'db', 'scripts'),
];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', 'migrations']);

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...listTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const INLINE_CALLBACK = new Set([ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.FunctionExpression]);

/** `file:line` (repo-relative) of every `$transaction(...)` call whose first argument is not an inline function. */
export function findNonCallbackTransactions(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === '$transaction'
    ) {
      const [first] = node.arguments;
      if (!first || !INLINE_CALLBACK.has(first.kind)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        hits.push(`${path.relative(REPO_ROOT, fileName)}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

describe('tenant context: no array-form or indirect $transaction', () => {
  it('flags array, identifier and missing arguments, and allows inline callbacks', () => {
    const sample = `
      prisma.$transaction([a, b]);
      prisma.$transaction(ops);
      prisma.$transaction();
      this.prisma.$transaction(
        [a],
      );
      prisma.$transaction(async (tx) => tx.user.count());
      prisma.$transaction((tx) => tx.user.count(), { timeout: 1 });
      prisma.$transaction(function (tx) { return tx.user.count(); }, { maxWait: 1 });
      outbox.transaction((tx, emit) => emit(tx));
    `;
    expect(findNonCallbackTransactions(path.join(REPO_ROOT, 'sample.ts'), sample)).toEqual([
      'sample.ts:2',
      'sample.ts:3',
      'sample.ts:4',
      'sample.ts:5',
    ]);
  });

  it('scans the backend and the foundation packages (sanity check on the walk)', () => {
    const files = ROOTS.flatMap((root) => listTsFiles(root)).map((f) => path.relative(REPO_ROOT, f));
    expect(files).toContain('packages/appshore/platform/src/infrastructure/events/outbox.service.ts');
    expect(files).toContain('apps/backend/src/domains/billing/services/wallet.service.ts');
  });

  it('no source file uses one', () => {
    const offenders = ROOTS.flatMap((root) => listTsFiles(root)).flatMap((file) =>
      findNonCallbackTransactions(file, fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
