import { readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';

/**
 * The list contract (ADR "API contract", section 3) read from the TYPES of the API surface, not
 * from text: a TypeScript program over every controller answers what each `@Get` handler returns.
 *
 * - `lists`        — a handler that returns an array, or a paging envelope that is not `CursorList`
 *                    (`{ data, total }`, `{ rows, nextCursor }`, `{ items, total }` …), or that takes
 *                    `offset` / `page` / `skip`.
 * - `unboundedReads` — the service method a `@Get` handler calls (one hop) runs a `findMany` with no `take`.
 *
 * Used by `api-contract.spec.ts` (rules `output/lists-are-cursor-lists`, `output/list-reads-are-bounded`).
 * Not a spec itself — building the program costs a few seconds, so it is built once, lazily.
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const PLATFORM_SRC = join(REPO, 'packages', 'appshore', 'platform', 'src');
const PLATFORM_DIST = join(REPO, 'packages', 'appshore', 'platform', 'dist');

/** Envelope fields that mark a response as a page of something. */
const PAGING_FIELDS = ['total', 'nextCursor', 'hasMore', 'offset', 'page', 'pageSize', 'totalPages'];
const CURSOR_LIST_FIELDS = ['items', 'nextCursor', 'total'];
const OFFSET_PARAMS = ['offset', 'page', 'skip'];

export interface ListContractScan {
  lists: string[];
  unboundedReads: string[];
}

let cached: ListContractScan | undefined;

export function scanListContract(controllerFiles: string[]): ListContractScan {
  if (cached) return cached;
  const configPath = join(REPO, 'apps', 'backend', 'tsconfig.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined,
    },
  );
  const options = { ...(parsed?.options ?? {}), incremental: false, noEmit: true };
  const program = ts.createProgram(controllerFiles, options);
  const checker = program.getTypeChecker();
  const lists = new Set<string>();
  const unboundedReads = new Set<string>();

  for (const file of controllerFiles) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const rel = relative(REPO, file);
    visitControllers(source, (base, method) => {
      const sub = decoratorArg(method, 'Get');
      if (sub === undefined || hasDecorator(method, 'Res', true)) return;
      const key = `${rel} :: GET /${[base.replace(/^\/+|\/+$/g, ''), sub].filter(Boolean).join('/')}`;
      const shape = classify(checker, method);
      if (shape) lists.add(`${key} (${shape})`);
      for (const read of unboundedReadsOf(checker, method)) unboundedReads.add(`${key} -> ${read}`);
    });
  }
  cached = { lists: [...lists], unboundedReads: [...unboundedReads] };
  return cached;
}

function visitControllers(source: ts.SourceFile, onMethod: (base: string, method: ts.MethodDeclaration) => void) {
  source.forEachChild(function visit(node) {
    if (ts.isClassDeclaration(node)) {
      const base = decoratorArg(node, 'Controller');
      if (base === undefined) return;
      for (const member of node.members) if (ts.isMethodDeclaration(member)) onMethod(base, member);
      return;
    }
    node.forEachChild(visit);
  });
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined) ?? [];
}

/** The string path a decorator was given (`@Get('x')` → 'x', `@Get()` → ''); undefined when absent. */
function decoratorArg(node: ts.Node, name: string): string | undefined {
  for (const decorator of decoratorsOf(node)) {
    const call = decorator.expression;
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== name) continue;
    const arg = call.arguments[0];
    if (!arg) return '';
    if (ts.isStringLiteralLike(arg)) return arg.text;
    if (ts.isObjectLiteralExpression(arg)) {
      const path = arg.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'path');
      if (path && ts.isPropertyAssignment(path) && ts.isStringLiteralLike(path.initializer))
        return path.initializer.text;
    }
    return '';
  }
  return undefined;
}

function hasDecorator(method: ts.MethodDeclaration, name: string, onParams = false): boolean {
  const nodes: ts.Node[] = onParams ? [...method.parameters] : [method];
  return nodes.some((node) => decoratorArg(node, name) !== undefined);
}

/** What is wrong with this handler's response as a list, or undefined when nothing is. */
function classify(checker: ts.TypeChecker, method: ts.MethodDeclaration): string | undefined {
  for (const param of method.parameters) {
    const named = decoratorArg(param, 'Query');
    if (named && OFFSET_PARAMS.includes(named)) return `takes ${named}`;
    if (named === '') {
      const props = checker
        .getTypeAtLocation(param)
        .getProperties()
        .map((p) => p.name);
      const offset = props.find((p) => OFFSET_PARAMS.includes(p));
      if (offset) return `takes ${offset}`;
    }
  }
  const signature = checker.getSignatureFromDeclaration(method);
  if (!signature) return undefined;
  const returned = checker.getAwaitedType(checker.getReturnTypeOfSignature(signature));
  if (!returned) return undefined;
  const parts = returned.isUnion() ? returned.types : [returned];
  for (const part of parts) {
    if (part.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Null | ts.TypeFlags.Undefined)) continue;
    if (checker.isArrayType(part) || checker.isTupleType(part)) return 'array';
    // A page is rows plus paging fields; a summary that carries a `total` count is not a list.
    const props = part.getProperties();
    const names = props.map((p) => p.name);
    // Grouped counts (`bySentiment: […]`) are a breakdown, not rows.
    const holdsRows = props.some((p) => !/^by[A-Z]/.test(p.name) && checker.isArrayType(checker.getTypeOfSymbol(p)));
    const isPage = holdsRows && names.some((p) => PAGING_FIELDS.includes(p));
    if (isPage && !CURSOR_LIST_FIELDS.every((f) => names.includes(f))) return 'not a CursorList';
  }
  return undefined;
}

/** `this.<dep>.<method>(…)` calls in the handler, followed one hop, that run a `findMany` without `take`. */
function unboundedReadsOf(checker: ts.TypeChecker, method: ts.MethodDeclaration): string[] {
  const found: string[] = [];
  if (method.body && hasUnboundedFindMany(method.body.getText())) found.push('(handler)');
  method.body?.forEachChild(function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression) &&
      node.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      const body = calleeBody(checker, node.expression);
      if (body && hasUnboundedFindMany(body.text)) found.push(body.name);
    }
    node.forEachChild(visit);
  });
  return found;
}

function calleeBody(checker: ts.TypeChecker, callee: ts.PropertyAccessExpression) {
  const symbol = checker.getSymbolAtLocation(callee);
  const declaration = symbol?.declarations?.find((d) => ts.isMethodDeclaration(d));
  if (!declaration || !ts.isClassDeclaration(declaration.parent)) return undefined;
  const name = `${declaration.parent.name?.text ?? '?'}.${callee.name.text}`;
  if (declaration.body) return { name, text: declaration.body.getText() };
  // A platform service seen through its built .d.ts — read the method from its source.
  const file = declaration.getSourceFile().fileName;
  if (!file.startsWith(PLATFORM_DIST)) return undefined;
  const srcFile = file.replace(PLATFORM_DIST, PLATFORM_SRC).replace(/\.d\.ts$/, '.ts');
  const text = methodBodyText(readFileSync(srcFile, 'utf8'), callee.name.text);
  return text ? { name, text } : undefined;
}

function methodBodyText(source: string, methodName: string): string | undefined {
  const file = ts.createSourceFile('m.ts', source, ts.ScriptTarget.Latest, true);
  let body: string | undefined;
  file.forEachChild(function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText() === methodName && node.body) body = node.body.getText();
    else node.forEachChild(visit);
  });
  return body;
}

/** A `findMany(` whose argument has no `take` and is not a lookup of a known id set (`id: { in: … }`). */
export function hasUnboundedFindMany(text: string): boolean {
  for (const match of text.matchAll(/\.findMany\(/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < text.length && depth > 0; i++) depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0;
    const arg = text.slice(match.index + match[0].length, i - 1);
    if (/\btake\b/.test(arg)) continue;
    if (/\b\w*(?:id|Id|Ids)\s*:\s*\{\s*in\s*:/.test(arg)) continue;
    return true;
  }
  return false;
}
