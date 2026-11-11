/**
 * ADR "API contract", section 3: request inputs are classes. Reads handler signatures (source text, no Nest boot) and reports
 * every `@Body` / `@Query` parameter that the global `AppValidationPipe` cannot validate:
 *
 * - `@Body('x')` / `@Query('x')` — a pick-param: the pipe sees a bare string (or an array, for a repeated key).
 * - a type that is not a class — an interface, `type` alias, inline `{ … }`, `Record<…>`, `any`, an array: at
 *   runtime the param's design type is `Object`, so the pipe validates nothing and forbids nothing.
 * - a class imported with `import type` — erased at compile time, so its design type is `Object` too.
 *
 * Used by `api-contract.spec.ts` (rules `input/body-is-a-dto-class` and `input/query-is-a-dto`).
 */

export interface InputParam {
  decorator: 'Body' | 'Query';
  /** The string argument of a pick-param (`@Query('limit')` → `limit`); null for `@Query()`. */
  pick: string | null;
  /** The declared type text, whitespace-collapsed; '' when the param has no annotation. */
  type: string;
}

/** The text from `start` up to the first `,` or `)` at bracket depth 0 (the end of one parameter's type). */
function readType(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) {
      if (depth === 0) return text.slice(start, i).trim();
      depth--;
    } else if ((c === ',' || c === '=') && depth === 0) return text.slice(start, i).trim();
  }
  return text.slice(start).trim();
}

/** The index just past the `)` closing the `(` at `open` — bracket-counted, so `new Pipe(50)` inside is skipped. */
function closeParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i + 1;
  }
  return text.length;
}

/** Every `@Body` / `@Query` parameter in a handler signature (pipes as arguments included). */
export function inputParams(signature: string): InputParam[] {
  const text = signature.replace(/\s+/g, ' ');
  const params: InputParam[] = [];
  for (const m of text.matchAll(/@(Body|Query)\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const end = closeParen(text, open);
    const pick = text.slice(open + 1, end - 1).match(/^\s*(['"`])([^'"`]*)\1/)?.[2] ?? null;
    const name = text.slice(end).match(/^\s*(?:\w+|\{[^}]*\})\s*\??\s*(:)?/);
    if (!name) continue;
    params.push({
      decorator: m[1] as InputParam['decorator'],
      pick,
      type: name[1] ? readType(text, end + name[0].length) : '',
    });
  }
  return params;
}

/** Names of every class declared in the sources. */
export function declaredClasses(sources: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm)) names.add(m[1]);
  }
  return names;
}

/** Names a file imports only as types (`import type { A }` / `import { type A }`) — erased, so `Object` at runtime. */
export function typeOnlyImports(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const raw of m[2].split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const typeOnly = Boolean(m[1]) || part.startsWith('type ');
      const local = part
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (typeOnly && local) names.add(local);
    }
  }
  return names;
}

/** True when the pipe can validate a param of this type: a class declared in the sources, imported as a value. */
export function isDtoClass(type: string, classes: ReadonlySet<string>, typeOnly: ReadonlySet<string>): boolean {
  return /^[A-Z]\w*$/.test(type) && classes.has(type) && !typeOnly.has(type);
}
